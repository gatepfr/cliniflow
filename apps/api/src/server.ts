import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { logger } from './plugins/logger.js';
import authPlugin from './plugins/auth.js';
import tenantPlugin from './plugins/tenant.js';
import { authRoutes } from './routes/auth/index.js';
import { webhookRoutes } from './routes/webhooks/index.js';

export async function buildApp() {
  const app = Fastify({
    logger,
    trustProxy: true,
  });

  // CORS
  await app.register(fastifyCors, {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  });

  // Auth + tenant plugins
  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  // Global error handler
  app.setErrorHandler(async (error, _request, reply) => {
    if (error.name === 'AppError') {
      return reply
        .code((error as unknown as { statusCode: number }).statusCode)
        .send((error as unknown as { toJSON: () => unknown }).toJSON());
    }
    // Unexpected errors: log, return generic 500 (never leak stack/SQL)
    app.log.error({ err: { message: error.message, code: (error as NodeJS.ErrnoException).code } }, 'Unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}

export async function startServer() {
  const app = await buildApp();
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
}
