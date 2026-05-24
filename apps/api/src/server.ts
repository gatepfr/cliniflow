import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { logger } from './plugins/logger.js';
import authPlugin from './plugins/auth.js';
import tenantPlugin from './plugins/tenant.js';
import { authRoutes } from './routes/auth/index.js';
import { webhookRoutes } from './routes/webhooks/index.js';

interface BuildAppOptions {
  /** Override logger — pass `false` in tests to silence log output */
  logger?: boolean | object;
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    // Cast to any to bridge Pino Logger -> FastifyLoggerOptions — safe, same pino instance
    // In tests, caller may pass { logger: false } to suppress output.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: (opts.logger !== undefined ? opts.logger : logger) as any,
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
  app.setErrorHandler(async (error: unknown, _request, reply) => {
    const err = error as Error & { name?: string; statusCode?: number; toJSON?: () => unknown; code?: string };
    if (err.name === 'AppError' && err.statusCode != null && typeof err.toJSON === 'function') {
      return reply.code(err.statusCode).send(err.toJSON());
    }
    // Unexpected errors: log without PII/stack, return generic 500 (LGPD)
    app.log.error({ err: { message: err.message, code: err.code } }, 'Unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}

export async function startServer() {
  const app = await buildApp();
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
}
