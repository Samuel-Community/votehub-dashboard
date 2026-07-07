import crypto from 'node:crypto';
import { models } from '../models/index.js';
import { encrypt, decrypt, maskSecret, randomToken } from '../lib/crypto.js';
import { validateBotToken, lookupBotById, parseDiscordWebhookUrl, sendDiscordWebhook } from '../lib/discord.js';
import { slugify } from '../lib/utils.js';
import { audit } from '../lib/audit.js';
import { config } from '../lib/config.js';

function asId(v) { return v?._id?.toString?.() || v?._id || v?.toString?.() || v; }
function botDto(bot) {
  return {
    id: asId(bot._id), name: bot.name, slug: bot.slug, botId: bot.botId, clientId: bot.clientId,
    avatarUrl: bot.avatarUrl, status: bot.status, tokenHealth: bot.tokenHealth,
    lastValidatedAt: bot.lastValidatedAt, createdAt: bot.createdAt, updatedAt: bot.updatedAt,
  };
}
function integrationDto(i, bot) {
  return {
    id: asId(i._id), botId: asId(i.managedBot), botName: bot?.name || i.managedBot?.name || '',
    name: i.name, slug: i.slug, path: `/webhook/${bot?.slug || i.managedBot?.slug || ':botSlug'}/${i.slug}`,
    finalUrl: `${config.publicBaseUrl}/webhook/${bot?.slug || i.managedBot?.slug || ':botSlug'}/${i.slug}`,
    authorizationTokenMasked: maskSecret(i.authorizationToken), upvoteURL: i.upvoteURL, iconURL: i.iconURL,
    payloadUserField: i.payloadUserField, enabled: i.enabled, status: i.enabled ? 'enabled' : 'disabled',
    votesReceived: i.votesReceived || 0, lastVoteAt: i.lastVoteAt, notificationTarget: asId(i.notificationTarget),
  };
}

function setJsonPath(target, path, value) {
  const parts = String(path || 'user').split('.').filter(Boolean);
  if (!parts.length) {
    target.user = value;
    return target;
  }

  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
  return target;
}

function buildLegacyTestPayload(integration, bot) {
  const payload = { type: 'test' };
  setJsonPath(payload, integration.payloadUserField || 'user', bot.botId);

  if (!payload.user) payload.user = bot.botId;
  if (!payload.bot) payload.bot = bot.botId;

  return payload;
}

function webhookDto(w, bot) {
  return {
    id: asId(w._id), botId: asId(w.managedBot), botName: bot?.name || w.managedBot?.name || '',
    name: w.name, webhookUrlMasked: `https://discord.com/api/webhooks/${w.discordWebhookId}/${maskSecret(decrypt(w.encryptedDiscordWebhookToken || ''), 3)}`,
    webhookUsername: w.webhookUsername, webhookAvatar: w.webhookAvatar, isDefault: w.isDefault, enabled: w.enabled,
  };
}

export async function apiRoutes(app) {
  app.get('/api/health', async () => ({ ok: true, service: 'VoteHub Fastify API', time: new Date().toISOString() }));

  app.get('/api/dashboard', async () => {
    const bots = await models.ManagedBot.find({}).lean();
    const integrations = await models.VoteListIntegration.find({}).lean();
    const webhooks = await models.NotificationTarget.find({}).lean();
    const voteLogs = await models.VoteLog.find({}).sort({ receivedAt: -1 }).limit(50).lean();
    const auditLogs = await models.AuditLog.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return {
      bots: bots.map(botDto),
      integrations: integrations.map(i => integrationDto(i, bots.find(b => String(asId(b._id)) === String(asId(i.managedBot))))),
      webhooks: webhooks.map(w => webhookDto(w, bots.find(b => String(asId(b._id)) === String(asId(w.managedBot))))),
      voteLogs: voteLogs.map(l => ({ ...l, id: asId(l._id), managedBot: asId(l.managedBot), voteListIntegration: asId(l.voteListIntegration) })),
      auditLogs: auditLogs.map(l => ({ ...l, id: asId(l._id) })),
      settings: { publicBaseUrl: config.publicBaseUrl, authDisabled: config.disableAuth },
    };
  });

  app.get('/api/bots', async () => (await models.ManagedBot.find({}).lean()).map(botDto));

  app.post('/api/bots', async (request, reply) => {
    const body = request.body || {};
    let info = null;
    if (!body.botToken) return reply.code(400).send({ error: true, message: 'Bot token is required to auto-fetch bot name/avatar from Discord.' });
    try {
      info = await validateBotToken(body.botToken, body.botId || '');
    } catch (error) {
      return reply.code(400).send({ error: true, message: error.message });
    }
    const name = body.name || info.globalName || info.username;
    const bot = await models.ManagedBot.create({
      name,
      slug: slugify(body.slug || name),
      botId: info.id,
      clientId: body.clientId || info.id,
      encryptedBotToken: encrypt(body.botToken),
      avatarUrl: body.avatarUrl || info.avatarUrl,
      status: 'active',
      tokenHealth: 'Valid token',
      lastValidatedAt: new Date(),
    });
    await audit(request, 'Bot created', 'bot', bot, null, { name: bot.name, botId: bot.botId });
    return botDto(bot);
  });

  app.post('/api/discord/bot/:id/lookup', async (request, reply) => {
    const firstBot = (await models.ManagedBot.find({}).limit(1).lean())[0];
    try {
      const bot = await lookupBotById(request.params.id, firstBot?.encryptedBotToken);
      return bot;
    } catch (error) {
      return reply.code(error.statusCode || 400).send({ error: true, message: error.message });
    }
  });

  app.patch('/api/bots/:id', async (request, reply) => {
    const body = request.body || {};
    const update = { ...body };
    if (body.name && !body.slug) update.slug = slugify(body.name);
    if (body.botToken) update.encryptedBotToken = encrypt(body.botToken), delete update.botToken;
    const bot = await models.ManagedBot.findByIdAndUpdate(request.params.id, update, { new: true });
    if (!bot) return reply.code(404).send({ error: true, message: 'Bot not found.' });
    await audit(request, 'Bot updated', 'bot', bot, null, { name: bot.name, status: bot.status });
    return botDto(bot);
  });

  app.delete('/api/bots/:id', async (request, reply) => {
    const bot = await models.ManagedBot.findByIdAndDelete(request.params.id);
    if (!bot) return reply.code(404).send({ error: true, message: 'Bot not found.' });
    await models.VoteListIntegration.deleteMany({ managedBot: request.params.id });
    await models.NotificationTarget.deleteMany({ managedBot: request.params.id });
    await audit(request, 'Bot deleted', 'bot', bot);
    return { ok: true };
  });

  app.post('/api/bots/:id/validate', async (request, reply) => {
    const bot = await models.ManagedBot.findById(request.params.id);
    if (!bot) return reply.code(404).send({ error: true, message: 'Bot not found.' });
    try {
      const info = await validateBotToken(decrypt(bot.encryptedBotToken), bot.botId);
      bot.name = bot.name || info.username;
      bot.avatarUrl = bot.avatarUrl || info.avatarUrl;
      bot.status = 'active';
      bot.tokenHealth = 'Valid token';
      bot.lastValidatedAt = new Date();
      await bot.save?.();
      if (!bot.save) await models.ManagedBot.findByIdAndUpdate(bot._id, bot, { new: true });
      await audit(request, 'Token validated', 'bot', bot);
      return botDto(bot);
    } catch (error) {
      await models.ManagedBot.findByIdAndUpdate(bot._id, { status: 'error', tokenHealth: error.message, lastValidatedAt: new Date() });
      await audit(request, 'Token validation failed', 'bot', bot, null, { error: error.message });
      return reply.code(400).send({ error: true, message: error.message });
    }
  });

  app.post('/api/bots/:id/integrations', async (request) => {
    const body = request.body || {};
    const bot = await models.ManagedBot.findById(request.params.id);
    const integration = await models.VoteListIntegration.create({
      managedBot: request.params.id,
      name: body.name,
      slug: slugify(body.slug || body.name),
      authorizationToken: body.authorizationToken || randomToken(slugify(body.name).slice(0, 8)),
      upvoteURL: body.upvoteURL,
      iconURL: body.iconURL,
      payloadUserField: body.payloadUserField || 'user',
      notificationTarget: body.notificationTarget || undefined,
      enabled: body.enabled !== false,
    });
    await audit(request, 'Integration created', 'integration', integration, null, { name: integration.name });
    return integrationDto(integration, bot);
  });

  app.patch('/api/integrations/:id', async (request, reply) => {
    const body = request.body || {};
    if (body.name && !body.slug) body.slug = slugify(body.name);
    const integration = await models.VoteListIntegration.findByIdAndUpdate(request.params.id, body, { new: true });
    if (!integration) return reply.code(404).send({ error: true, message: 'Integration not found.' });
    const bot = await models.ManagedBot.findById(integration.managedBot);
    await audit(request, 'Integration updated', 'integration', integration, null, { name: integration.name });
    return integrationDto(integration, bot);
  });

  app.delete('/api/integrations/:id', async (request, reply) => {
    const integration = await models.VoteListIntegration.findByIdAndDelete(request.params.id);
    if (!integration) return reply.code(404).send({ error: true, message: 'Integration not found.' });
    await audit(request, 'Integration deleted', 'integration', integration);
    return { ok: true };
  });



  app.get('/api/integrations/:id/copy-data', async (request, reply) => {
    const integration = await models.VoteListIntegration.findById(request.params.id).lean();

    if (!integration) {
      return reply.code(404).send({ error: true, message: 'Integration not found.' });
    }

    const bot = await models.ManagedBot.findById(integration.managedBot).lean();

    if (!bot) {
      return reply.code(404).send({ error: true, message: 'Bot not found.' });
    }

    return {
      finalUrl: `${config.publicBaseUrl}/webhook/${bot.slug}/${integration.slug}`,
      authorizationToken: integration.authorizationToken,
      authorizationTokenMasked: maskSecret(integration.authorizationToken),
    };
  });

  app.post('/api/integrations/:id/test', async (request, reply) => {
    const integration = await models.VoteListIntegration.findById(request.params.id);

    if (!integration) {
      return reply.code(404).send({ error: true, message: 'Integration not found.' });
    }

    const bot = await models.ManagedBot.findById(integration.managedBot);

    if (!bot) {
      return reply.code(404).send({ error: true, message: 'Bot not found.' });
    }

    const isTopggV1 = String(integration.authorizationToken || '').startsWith('whs_');
    const payload = request.body && Object.keys(request.body).length
      ? request.body
      : isTopggV1
        ? {
            type: 'webhook.test',
            data: {
              user: {
                id: 'topgg-test-user',
                platform_id: bot.botId,
                name: 'VoteHub Test',
                avatar_url: bot.avatarUrl,
              },
              project: {
                id: bot.botId,
                type: 'bot',
                platform: 'discord',
                platform_id: bot.botId,
              },
            },
          }
        : buildLegacyTestPayload(integration, bot);

    const headers = { 'content-type': 'application/json' };
    const rawBody = JSON.stringify(payload);

    if (isTopggV1) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = crypto
        .createHmac('sha256', integration.authorizationToken)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
      headers['x-topgg-signature'] = `t=${timestamp},v1=${signature}`;
    } else {
      headers.authorization = integration.authorizationToken;
    }

    const result = await app.inject({
      method: 'POST',
      url: `/webhook/${bot.slug}/${integration.slug}`,
      headers,
      payload: rawBody,
    });

    return {
      statusCode: result.statusCode,
      payload: result.json(),
    };
  });

  app.post('/api/bots/:id/notification-targets', async (request) => {
    const body = request.body || {};
    const parsed = parseDiscordWebhookUrl(body.webhookUrl);
    if (body.isDefault) await models.NotificationTarget.find({ managedBot: request.params.id }).then?.(docs => Promise.all(docs.map(d => models.NotificationTarget.findByIdAndUpdate(d._id, { isDefault: false }))));
    const target = await models.NotificationTarget.create({
      managedBot: request.params.id,
      name: body.name,
      discordWebhookId: parsed.id,
      encryptedDiscordWebhookToken: encrypt(parsed.token),
      webhookAvatar: body.webhookAvatar,
      webhookUsername: body.webhookUsername || 'VoteHub Relay',
      isDefault: Boolean(body.isDefault),
      enabled: body.enabled !== false,
    });
    const bot = await models.ManagedBot.findById(request.params.id);
    await audit(request, 'Webhook created', 'webhook', target, null, { name: target.name });
    return webhookDto(target, bot);
  });

  app.patch('/api/notification-targets/:id', async (request, reply) => {
    const body = request.body || {};
    if (body.webhookUrl) {
      const parsed = parseDiscordWebhookUrl(body.webhookUrl);
      body.discordWebhookId = parsed.id;
      body.encryptedDiscordWebhookToken = encrypt(parsed.token);
      delete body.webhookUrl;
    }
    const target = await models.NotificationTarget.findByIdAndUpdate(request.params.id, body, { new: true });
    if (!target) return reply.code(404).send({ error: true, message: 'Webhook not found.' });
    const bot = await models.ManagedBot.findById(target.managedBot);
    await audit(request, 'Webhook updated', 'webhook', target, null, { name: target.name });
    return webhookDto(target, bot);
  });

  app.delete('/api/notification-targets/:id', async (request, reply) => {
    const target = await models.NotificationTarget.findByIdAndDelete(request.params.id);
    if (!target) return reply.code(404).send({ error: true, message: 'Webhook not found.' });
    await audit(request, 'Webhook deleted', 'webhook', target);
    return { ok: true };
  });

  app.post('/api/notification-targets/:id/test', async (request, reply) => {
    const target = await models.NotificationTarget.findById(request.params.id);
    if (!target) return reply.code(404).send({ error: true, message: 'Webhook not found.' });
    await sendDiscordWebhook({
      id: target.discordWebhookId,
      token: decrypt(target.encryptedDiscordWebhookToken),
      username: target.webhookUsername || 'VoteHub Relay',
      avatarUrl: target.webhookAvatar,
      embeds: [{ title: 'VoteHub test notification', description: 'Your Discord webhook is correctly connected.', color: 0x5865f2, timestamp: new Date().toISOString() }],
    });
    await audit(request, 'Webhook test sent', 'webhook', target);
    return { ok: true };
  });

  app.get('/api/vote-logs', async () => (await models.VoteLog.find({}).sort({ receivedAt: -1 }).limit(100).lean()).map(l => ({ ...l, id: asId(l._id) })));
  app.get('/api/audit-logs', async () => (await models.AuditLog.find({}).sort({ createdAt: -1 }).limit(100).lean()).map(l => ({ ...l, id: asId(l._id) })));

  app.get('/api/stats/overview', async () => {
    const sinceToday = new Date(); sinceToday.setHours(0,0,0,0);
    return {
      totalBots: await models.ManagedBot.countDocuments({}),
      activeIntegrations: await models.VoteListIntegration.countDocuments({ enabled: true }),
      votesToday: await models.VoteLog.countDocuments({ receivedAt: { $gte: sinceToday } }),
      failedRequests: await models.VoteLog.countDocuments({ status: { $in: ['failed', 'unauthorized'] } }),
      systemStatus: 'healthy',
    };
  });
}
