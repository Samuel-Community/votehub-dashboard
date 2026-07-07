import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config as envConfig } from '../lib/config.js';
import { connectDatabase, models } from '../models/index.js';
import { encrypt } from '../lib/crypto.js';
import { slugify } from '../lib/utils.js';
import { validateBotToken } from '../lib/discord.js';

const fakeApp = { log: console };
await connectDatabase(fakeApp);

const legacyPath = path.resolve(process.env.LEGACY_CONFIG_PATH || './config.js');
const legacy = (await import(pathToFileURL(legacyPath).href)).default || (await import(pathToFileURL(legacyPath).href));

const botToken = legacy.bot?.token || process.env.BOT_TOKEN;
if (!botToken) throw new Error('Legacy bot token not found.');
const info = await validateBotToken(botToken);
const botName = legacy.bot?.name || info.username;
const bot = await models.ManagedBot.create({
  name: botName,
  slug: slugify(botName),
  botId: info.id,
  clientId: info.id,
  encryptedBotToken: encrypt(botToken),
  avatarUrl: info.avatarUrl,
  status: 'active',
  tokenHealth: 'Valid token',
  lastValidatedAt: new Date(),
});

let target = null;
if (legacy.webhook?.id && legacy.webhook?.token) {
  target = await models.NotificationTarget.create({
    managedBot: bot._id,
    name: legacy.webhook.name || 'Vote notifications',
    discordWebhookId: legacy.webhook.id,
    encryptedDiscordWebhookToken: encrypt(legacy.webhook.token),
    webhookAvatar: legacy.webhook.avatar,
    webhookUsername: legacy.webhook.name || 'VoteHub Relay',
    isDefault: true,
    enabled: true,
  });
}

for (const list of legacy.lists || []) {
  await models.VoteListIntegration.create({
    managedBot: bot._id,
    name: list.name,
    slug: slugify(String(list.path || list.name).replace(/^\//, '')),
    authorizationToken: list.token,
    upvoteURL: list.upvoteURL,
    iconURL: list.icon,
    payloadUserField: 'user',
    notificationTarget: target?._id,
    enabled: true,
  });
}

console.log(`Migration complete for ${bot.name}. Public URL: ${envConfig.publicBaseUrl}`);
process.exit(0);
