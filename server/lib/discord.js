import { decrypt } from './crypto.js';
import { config } from './config.js';

const API = 'https://discord.com/api/v10';

export function discordAvatarUrl(user, size = 128) {
  if (!user?.id) return '';
  if (!user.avatar) {
    const index = user.discriminator && user.discriminator !== '0'
      ? Number(user.discriminator) % 5
      : (BigInt(user.id) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
}

async function discordFetch(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token.startsWith('Bot ') || token.startsWith('Bearer ') ? token : `Bot ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Discord API error ${res.status}`);
    err.statusCode = res.status;
    err.discord = data;
    throw err;
  }
  return data;
}

export async function validateBotToken(encryptedOrRawToken, expectedBotId = '') {
  const token = encryptedOrRawToken.includes('.') ? encryptedOrRawToken : encryptedOrRawToken;
  const raw = encryptedOrRawToken.length > 80 && !encryptedOrRawToken.startsWith('M') ? decrypt(encryptedOrRawToken) : encryptedOrRawToken;
  const me = await discordFetch('/users/@me', raw);
  if (expectedBotId && me.id !== expectedBotId) {
    throw new Error(`Token belongs to bot ${me.id}, not ${expectedBotId}.`);
  }
  return {
    id: me.id,
    username: me.username,
    globalName: me.global_name,
    avatar: me.avatar,
    avatarUrl: discordAvatarUrl(me, 256),
    bot: Boolean(me.bot),
  };
}

export async function fetchDiscordUser(userId, encryptedBotToken) {
  const token = decrypt(encryptedBotToken);
  const user = await discordFetch(`/users/${userId}`, token);
  return { ...user, avatarUrl: discordAvatarUrl(user, 256) };
}

export async function lookupBotById(botId, encryptedBotToken = '') {
  const token = encryptedBotToken ? decrypt(encryptedBotToken) : config.botLookupToken;
  if (!token) {
    return { id: botId, partial: true, message: 'BOT_LOOKUP_TOKEN or an existing bot token is required to fetch Discord username/avatar by ID.' };
  }
  const user = await discordFetch(`/users/${botId}`, token);
  return { ...user, avatarUrl: discordAvatarUrl(user, 256), partial: false };
}

export async function sendDiscordWebhook({ id, token, username, avatarUrl, embeds = [], content = null }) {
  const res = await fetch(`${API}/webhooks/${id}/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, username, avatar_url: avatarUrl || undefined, embeds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Webhook send failed ${res.status}`);
    err.statusCode = res.status;
    err.discord = data;
    throw err;
  }
  return data;
}

export function parseDiscordWebhookUrl(url = '') {
  const match = String(url).match(/discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([^\s/]+)/i);
  if (!match) throw new Error('Invalid Discord webhook URL.');
  return { id: match[1], token: match[2] };
}
