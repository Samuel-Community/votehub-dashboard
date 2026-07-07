import { config } from './config.js';
import { signSession, verifySession } from './crypto.js';
import { models } from '../models/index.js';

export function setSessionCookie(reply, user) {
  const token = signSession({
    discordId: user.discordId,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  });
  reply.setCookie('votehub_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie(reply) {
  reply.clearCookie('votehub_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
  });
}

export async function currentUser(request) {
  if (config.disableAuth) {
    return { discordId: 'dev', username: 'Development Admin', avatarUrl: '', role: 'owner' };
  }
  const payload = verifySession(request.cookies?.votehub_session);
  if (!payload) return null;
  return payload;
}

export async function requireAuth(request, reply) {
  const user = await currentUser(request);
  if (!user) return reply.code(401).send({ error: true, message: 'Authentication required.' });
  request.admin = user;
}

export async function ensureAllowedDiscordUser(discordUser) {
  const allowedFromEnv = config.ownerDiscordIds.includes(discordUser.id);
  const existing = await models.AdminUser.findOne({ discordId: discordUser.id });
  if (!allowedFromEnv && !existing) return null;
  const role = allowedFromEnv ? 'owner' : existing.role;
  const user = existing
    ? await models.AdminUser.findByIdAndUpdate(existing._id, { username: discordUser.username, avatarUrl: discordUser.avatarUrl, role, lastLoginAt: new Date() }, { returnDocument: 'after' })
    : await models.AdminUser.create({ discordId: discordUser.id, username: discordUser.username, avatarUrl: discordUser.avatarUrl, role, lastLoginAt: new Date() });
  return user;
}
