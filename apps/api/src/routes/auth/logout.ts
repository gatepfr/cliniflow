import type { FastifyPluginAsync } from 'fastify';
import { redis } from '../../lib/redis.js';

export const logoutRoute: FastifyPluginAsync = async (app) => {
  app.post('/logout', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const refreshToken = request.cookies['refreshToken'];
    if (refreshToken) {
      // Immediate invalidation (FOUND-05, D-05, T-1-PLAN06-02)
      await redis.del(`token:${refreshToken}`);
    }
    reply.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    return { ok: true };
  });
};
