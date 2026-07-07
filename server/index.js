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
const app = Fastify({ logger: true, trustProxy: true });

app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
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
});

await app.register(helmet, {
  // Security headers are managed by NGINX in production to avoid duplicate/conflicting
  // values reported by OWASP ZAP. Keep these disabled here.
  contentSecurityPolicy: false,
  hsts: false,
  strictTransportSecurity: false,
  frameguard: false,
  xFrameOptions: false,
  referrerPolicy: false,
  permittedCrossDomainPolicies: false,
  xPermittedCrossDomainPolicies: false,
  xContentTypeOptions: false,
  xDnsPrefetchControl: false,
  xDownloadOptions: false,
  xXssProtection: false,
  xPoweredBy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false,
});

await app.register(cors, {
  origin(origin, callback) {
    if (config.nodeEnv !== 'production') return callback(null, true);
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Authorization', 'X-Webhook-Token', 'X-VoteHub-Token', 'X-DBL-Token', 'X-Botlist-Token', 'X-Topgg-Signature'],
});
await app.register(cookie);
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(formbody);
await connectDatabase(app);

await app.register(authRoutes);

app.addHook('preHandler', async (request, reply) => {
  const publicRoutes = ['/api/auth/discord', '/api/auth/discord/callback', '/api/auth/me', '/api/health'];
  if (request.url.startsWith('/webhook/') || publicRoutes.some(route => request.url.startsWith(route))) return;
  if (request.url.startsWith('/api/')) return requireAuth(request, reply);
});

await app.register(apiRoutes);
await app.register(webhookRoutes);

if (config.nodeEnv === 'production') {
  await app.register(staticPlugin, { root: path.join(root, 'dist'), prefix: '/' });
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/webhook/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: true, message: 'Not found.' });
  });
}

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  reply.code(error.statusCode || 500).send({ error: true, message: config.nodeEnv === 'production' ? 'Internal server error.' : error.message });
});

if (config.nodeEnv === 'production') {
  const unsafeSecrets = ['change-me-super-secret', 'replace-with-a-long-random-secret', 'replace-with-a-different-long-random-secret'];
  if (unsafeSecrets.includes(config.sessionSecret) || unsafeSecrets.includes(config.encryptionSecret)) {
    throw new Error('Unsafe production secret detected. Set strong SESSION_SECRET and ENCRYPTION_SECRET values.');
  }
  if (config.disableAuth) {
    throw new Error('DISABLE_AUTH=true is not allowed in production.');
  }
}

await app.listen({ port: config.port, host: '127.0.0.1' });
