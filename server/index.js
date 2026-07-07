import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { connectDatabase } from './models/index.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { webhookRoutes } from './routes/webhook.js';
import { requireAuth } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const app = Fastify({
  logger: true,
  trustProxy: true,
});

const isProduction = config.nodeEnv === 'production';

const cspDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],

  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],

  // À garder pour le moment, sinon certains styles du build peuvent casser.
  // On pourra durcir plus tard après test visuel.
  styleSrc: ["'self'", "'unsafe-inline'"],

  imgSrc: [
    "'self'",
    'data:',
    'blob:',
    'https://cdn.discordapp.com',
    'https://media.discordapp.net',
    'https://images-ext-1.discordapp.net',
    'https://images-ext-2.discordapp.net',
    'https://top.gg',
  ],

  fontSrc: ["'self'", 'data:'],

  connectSrc: [
    "'self'",
    'https://discord.com',
    'https://discordapp.com',
    'https://cdn.discordapp.com',
    config.publicBaseUrl,
    config.frontendUrl,
  ].filter(Boolean),
};

if (isProduction) {
  cspDirectives.upgradeInsecureRequests = [];
}

app.removeContentTypeParser('application/json');

app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (request, body, done) => {
    const rawBody = body.toString('utf8');
    request.rawBody = rawBody;

    if (!rawBody) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(rawBody));
    } catch (error) {
      error.statusCode = 400;
      done(error);
    }
  },
);

await app.register(helmet, {
  // Important :
  // HSTS est désactivé côté Fastify pour éviter :
  // "Strict-Transport-Security option was specified twice"
  // Avec Cloudflare Flexible, gère HSTS côté Cloudflare plus tard si besoin.
  hsts: false,

  contentSecurityPolicy: {
    useDefaults: true,
    directives: cspDirectives,
  },

  frameguard: {
    action: 'deny',
  },

  noSniff: true,

  referrerPolicy: {
    policy: 'no-referrer',
  },

  crossOriginEmbedderPolicy: false,
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (!isProduction) {
      callback(null, true);
      return;
    }

    const allowedOrigins = new Set(
      [config.publicBaseUrl, config.frontendUrl].filter(Boolean),
    );

    callback(null, allowedOrigins.has(origin));
  },
  credentials: true,
});

await app.register(cookie);

await app.register(rateLimit, {
  max: 120,
  timeWindow: '1 minute',
});

await app.register(formbody);

await connectDatabase(app);

app.addHook('onSend', async (request, reply, payload) => {
  reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  reply.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );

  return payload;
});

await app.register(authRoutes);

app.addHook('preHandler', async (request, reply) => {
  const publicRoutes = [
    '/api/auth/discord',
    '/api/auth/discord/callback',
    '/api/auth/me',
    '/api/health',
  ];

  if (
    request.url.startsWith('/webhook/') ||
    publicRoutes.some((route) => request.url.startsWith(route))
  ) {
    return;
  }

  if (request.url.startsWith('/api/')) {
    return requireAuth(request, reply);
  }
});

await app.register(apiRoutes);
await app.register(webhookRoutes);

if (isProduction) {
  await app.register(staticPlugin, {
    root: path.join(root, 'dist'),
    prefix: '/',
    setHeaders(res) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    },
  });

  app.setNotFoundHandler((request, reply) => {
    if (
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/webhook/')
    ) {
      return reply.sendFile('index.html');
    }

    return reply.code(404).send({
      error: true,
      message: 'Not found.',
    });
  });
}

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  reply.code(error.statusCode || 500).send({
    error: true,
    message: isProduction ? 'Internal server error.' : error.message,
  });
});

await app.listen({
  port: config.port,
  host: '127.0.0.1',
});