import crypto from 'node:crypto';
import { models } from '../models/index.js';
import { decrypt } from '../lib/crypto.js';
import { fetchDiscordUser, sendDiscordWebhook } from '../lib/discord.js';
import { getJsonPath } from '../lib/utils.js';

function firstHeader(request, names) {
  for (const name of names) {
    const value = request.headers[name.toLowerCase()] || request.headers[name];
    if (value) return Array.isArray(value) ? value[0] : value;
  }
  return '';
}

function authHeader(request) {
  return firstHeader(request, ['authorization', 'x-authorization', 'x-webhook-token', 'x-votehub-token', 'x-dbl-token', 'x-botlist-token']);
}

function topggSignatureHeader(request) {
  return firstHeader(request, ['x-topgg-signature']);
}

function normalizeToken(value = '') {
  return String(value)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^Bot\s+/i, '')
    .replace(/^Token\s+/i, '')
    .trim();
}

function requestTokenCandidates(request) {
  const candidates = [authHeader(request)];

  if (request.query && typeof request.query === 'object') {
    candidates.push(
      request.query.token,
      request.query.secret,
      request.query.authorization,
      request.query.auth,
      request.query.key,
    );
  }

  return candidates
    .filter(Boolean)
    .map((value) => String(value).trim());
}

function tokenMatches(request, expectedToken) {
  const expected = String(expectedToken || '').trim();
  if (!expected) return false;

  return requestTokenCandidates(request).some((candidate) => {
    return candidate === expected || normalizeToken(candidate) === expected;
  });
}

function parseTopggSignature(signatureHeader) {
  const parts = String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed = {};
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    parsed[key] = rest.join('=');
  }

  return {
    timestamp: parsed.t,
    signature: parsed.v1,
  };
}

function safeTimingEqual(expected, received) {
  try {
    const expectedBuffer = Buffer.from(String(expected || ''), 'hex');
    const receivedBuffer = Buffer.from(String(received || ''), 'hex');

    if (!expectedBuffer.length || expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

function verifyTopggV1Signature({ rawBody, signatureHeader, secret }) {
  const { timestamp, signature } = parseTopggSignature(signatureHeader);

  if (!timestamp || !signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody || ''}`)
    .digest('hex');

  return safeTimingEqual(expected, signature);
}

function isTopggV1Request(request, integration) {
  const signature = topggSignatureHeader(request);
  const token = String(integration.authorizationToken || '');
  const payloadType = request.body?.type;

  return Boolean(signature)
    || token.startsWith('whs_')
    || payloadType === 'vote.create'
    || payloadType === 'webhook.test';
}

function validateIncomingWebhook(request, integration) {
  if (isTopggV1Request(request, integration)) {
    const signature = topggSignatureHeader(request);

    if (!signature) {
      return {
        ok: false,
        statusCode: 401,
        message: 'Missing x-topgg-signature header.',
        logMessage: 'Missing Top.gg v1 signature header.',
      };
    }

    const valid = verifyTopggV1Signature({
      rawBody: request.rawBody || JSON.stringify(request.body || {}),
      signatureHeader: signature,
      secret: integration.authorizationToken,
    });

    if (!valid) {
      return {
        ok: false,
        statusCode: 401,
        message: 'Invalid Top.gg webhook signature.',
        logMessage: 'Invalid Top.gg v1 signature.',
      };
    }

    return { ok: true, mode: 'topgg-v1' };
  }

  if (!tokenMatches(request, integration.authorizationToken)) {
    return {
      ok: false,
      statusCode: 401,
      message: 'Invalid webhook token.',
      logMessage: 'Invalid authorization/token header.',
    };
  }

  return { ok: true, mode: 'authorization' };
}

function isDiscordSnowflake(value) {
  return /^\d{16,22}$/.test(String(value || ''));
}

function unwrapCandidate(value) {
  if (!value) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'object') {
    return value.platform_id
      || value.discord_id
      || value.discordId
      || value.user_id
      || value.userId
      || value.id
      || value.snowflake
      || value.value
      || null;
  }

  return null;
}

function extractDiscordUserId(payload, integration) {
  const configuredField = integration.payloadUserField || 'user';
  const candidatePaths = [
    configuredField,
    'data.user.platform_id',
    'data.user.discord_id',
    'data.user.discordId',
    'data.user.id',
    'data.voter.platform_id',
    'data.voter.discord_id',
    'data.voter.discordId',
    'data.voter.id',
    'user.platform_id',
    'user.discord_id',
    'user.discordId',
    'user.id',
    'user',
    'user_id',
    'userId',
    'userID',
    'discord_user_id',
    'discordUserId',
    'discordID',
    'discordId',
    'voter.platform_id',
    'voter.discord_id',
    'voter.discordId',
    'voter.id',
    'voter',
    'voter_id',
    'voterId',
    'member.user.id',
    'member.id',
    'member',
    'author.id',
    'author',
  ];

  const seen = new Set();
  for (const path of candidatePaths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);

    const extracted = unwrapCandidate(getJsonPath(payload || {}, path));
    if (isDiscordSnowflake(extracted)) return String(extracted);
  }

  return null;
}

function buildUserFromPayload(payload) {
  const user = payload?.data?.user
    || payload?.user
    || payload?.voter
    || payload?.data?.voter
    || payload?.member?.user
    || payload?.member
    || null;

  if (!user || typeof user !== 'object') return null;

  const id = user.platform_id || user.discord_id || user.discordId || user.user_id || user.userId || user.id;

  return {
    id,
    username: user.name || user.username || user.global_name || user.tag || 'Unknown user',
    avatarUrl: user.avatar_url || user.avatarUrl || user.avatar || undefined,
  };
}

async function resolveTarget(integration) {
  if (integration.notificationTarget) {
    const target = await models.NotificationTarget.findById(integration.notificationTarget);
    if (target?.enabled) return target;
  }

  return await models.NotificationTarget.findOne({
    managedBot: integration.managedBot,
    enabled: true,
    isDefault: true,
  }) || await models.NotificationTarget.findOne({
    managedBot: integration.managedBot,
    enabled: true,
  });
}

async function handleVote(request, reply, mode) {
  const { botSlug, integrationSlug, path } = request.params;
  let bot = null;
  let integration = null;

  if (mode === 'legacy') {
    integration = await models.VoteListIntegration.findOne({ slug: String(path || '').replace(/^\//, '') });
    if (integration) bot = await models.ManagedBot.findById(integration.managedBot);
  } else {
    bot = await models.ManagedBot.findOne({ slug: botSlug });
    if (bot) {
      integration = await models.VoteListIntegration.findOne({
        managedBot: bot._id,
        slug: integrationSlug,
      });
    }
  }

  if (!bot || !integration) {
    return reply.code(404).send({ error: true, message: 'Unknown vote webhook endpoint.' });
  }

  const logBase = {
    managedBot: bot._id,
    voteListIntegration: integration._id,
    rawPayload: request.body,
    receivedAt: new Date(),
  };

  if (bot.status !== 'active' || !integration.enabled) {
    await models.VoteLog.create({
      ...logBase,
      status: 'ignored',
      errorMessage: 'Bot or integration disabled.',
    });

    return reply.code(202).send({
      ok: true,
      ignored: true,
      message: 'Bot or integration disabled.',
    });
  }

  const auth = validateIncomingWebhook(request, integration);

  if (!auth.ok) {
    await models.VoteLog.create({
      ...logBase,
      status: 'unauthorized',
      errorMessage: auth.logMessage,
    });

    return reply.code(auth.statusCode).send({
      error: true,
      message: auth.message,
    });
  }

  const userId = extractDiscordUserId(request.body || {}, integration);

  if (!userId) {
    await models.VoteLog.create({
      ...logBase,
      status: 'failed',
      errorMessage: `No user id found. Payload field: ${integration.payloadUserField || 'user'}`,
    });

    return reply.code(400).send({
      error: true,
      message: 'No valid Discord user ID in payload. Set the correct Payload user field in the integration settings.',
      expectedExamples: ['user', 'user.id', 'user_id', 'userId', 'data.user.platform_id'],
    });
  }

  let user = null;
  const payloadUser = buildUserFromPayload(request.body || {});

  try {
    user = await fetchDiscordUser(String(userId), bot.encryptedBotToken);
  } catch (error) {
    if (payloadUser?.username) {
      user = {
        id: String(userId),
        username: payloadUser.username,
        avatarUrl: payloadUser.avatarUrl,
      };
    } else {
      await models.VoteLog.create({
        ...logBase,
        userId: String(userId),
        status: 'failed',
        errorMessage: `Discord API: ${error.message}`,
      });

      return reply.code(502).send({
        error: true,
        message: 'Failed to fetch Discord user.',
      });
    }
  }

  const target = await resolveTarget(integration);

  if (!target) {
    await models.VoteLog.create({
      ...logBase,
      userId: String(userId),
      username: user.username,
      avatarURL: user.avatarUrl,
      status: 'failed',
      errorMessage: 'No enabled notification webhook configured.',
    });

    return reply.code(500).send({
      error: true,
      message: 'No enabled notification webhook configured.',
    });
  }

  const isTopggTest = request.body?.type === 'webhook.test';
  const isTopggVote = request.body?.type === 'vote.create';
  const isLegacyTest = request.body?.type === 'test';
  const upvoteUrl = integration.upvoteURL?.startsWith('http')
    ? integration.upvoteURL
    : `https://${integration.upvoteURL || ''}`;

  const description = isTopggTest || isLegacyTest
    ? `✅ VoteHub successfully received the webhook test for \`${bot.name}\`.`
    : `:incoming_envelope: \`${user.username}\` just [voted](${upvoteUrl}) for \`${bot.name}\`!`;

  const fields = [];
  if (isTopggVote) {
    fields.push(
      { name: 'Vote weight', value: String(request.body?.data?.weight || 1), inline: true },
      { name: 'Provider', value: 'Top.gg v1', inline: true },
    );
  } else if (request.body?.isWeekend !== undefined) {
    fields.push({ name: 'Weekend multiplier', value: request.body.isWeekend ? 'Yes' : 'No', inline: true });
  }

  const embed = {
    author: {
      name: integration.name,
      icon_url: integration.iconURL || undefined,
    },
    title: isTopggTest || isLegacyTest ? 'Webhook test received' : undefined,
    description,
    color: isTopggTest || isLegacyTest ? 0x2ecc71 : 0x5865f2,
    thumbnail: user.avatarUrl ? { url: user.avatarUrl } : undefined,
    fields: fields.length ? fields : undefined,
    footer: {
      text: auth.mode === 'topgg-v1' ? `${integration.name} • Top.gg v1` : integration.name,
      icon_url: user.avatarUrl || undefined,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await sendDiscordWebhook({
      id: target.discordWebhookId,
      token: decrypt(target.encryptedDiscordWebhookToken),
      username: target.webhookUsername || 'VoteHub Relay',
      avatarUrl: target.webhookAvatar,
      embeds: [embed],
    });

    await models.VoteListIntegration.findByIdAndUpdate(integration._id, {
      $inc: { votesReceived: 1 },
      lastVoteAt: new Date(),
    });

    await models.VoteLog.create({
      ...logBase,
      notificationTarget: target._id,
      userId: String(userId),
      username: user.username,
      avatarURL: user.avatarUrl,
      status: 'success',
    });

    return {
      ok: true,
      mode: auth.mode,
      userId: String(userId),
      message: 'Notification sent to Discord.',
    };
  } catch (error) {
    await models.VoteLog.create({
      ...logBase,
      notificationTarget: target._id,
      userId: String(userId),
      username: user.username,
      avatarURL: user.avatarUrl,
      status: 'failed',
      errorMessage: `Webhook: ${error.message}`,
    });

    return reply.code(500).send({
      error: true,
      message: 'Failed to send Discord notification.',
    });
  }
}

export async function webhookRoutes(app) {
  app.post('/webhook/:path', async (request, reply) => handleVote(request, reply, 'legacy'));
  app.post('/webhook/:botSlug/:integrationSlug', async (request, reply) => handleVote(request, reply, 'multi'));
}
