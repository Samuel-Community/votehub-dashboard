import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'},${process.env.FRONTEND_URL || 'http://localhost:5173'}`)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || 'change-me-super-secret',
  encryptionSecret: process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET || 'change-me-super-secret',
  ownerDiscordIds: (process.env.OWNER_DISCORD_IDS || '').split(',').map(v => v.trim()).filter(Boolean),
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:4000/api/auth/discord/callback',
  botLookupToken: process.env.BOT_LOOKUP_TOKEN || '',
  disableAuth: process.env.DISABLE_AUTH === 'true',
  nodeEnv: process.env.NODE_ENV || 'development',
};
