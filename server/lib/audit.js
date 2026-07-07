import { models } from '../models/index.js';

export async function audit(request, action, targetType, target = {}, oldValue = null, newValue = null) {
  const admin = request.admin || {};
  await models.AuditLog.create({
    adminDiscordId: admin.discordId || 'system',
    adminUsername: admin.username || 'System',
    action,
    targetType,
    targetId: target._id || target.id || '',
    targetName: target.name || target.slug || '',
    oldValue,
    newValue,
    ip: request.ip,
    userAgent: request.headers['user-agent'] || '',
  });
}
