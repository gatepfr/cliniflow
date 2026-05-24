import type { FastifyPluginAsync } from 'fastify';
import { AppError, createId } from '@clinicaflow/shared';
import { redis } from '../../lib/redis.js';

export const refreshRoute: FastifyPluginAsync = async (app) => {
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies['refreshToken'];
    if (!refreshToken) {
      throw new AppError('NO_REFRESH_TOKEN', 'Refresh token não encontrado', 401);
    }

    // Validate JWT signature
    let payload: { userId: string; tenantId: string; tokenId: string };
    try {
      payload = await app.jwt.verify<{ userId: string; tenantId: string; tokenId: string }>(
        refreshToken,
      );
    } catch {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token inválido ou expirado', 401);
    }

    // One-time-use rotation (D-02): validate token exists in Redis
    const stored = await redis.get(`token:${refreshToken}`);
    if (!stored) {
      throw new AppError('TOKEN_REVOKED', 'Sessão expirada. Faça login novamente.', 401);
    }

    // Rotate: delete old, issue new (D-02 — one-time use)
    await redis.del(`token:${refreshToken}`);

    const newRefreshToken = await reply.jwtSign(
      { userId: payload.userId, tenantId: payload.tenantId, tokenId: createId() },
      { expiresIn: '30d' },
    );
    await redis.set(
      `token:${newRefreshToken}`,
      `${payload.userId}:${payload.tenantId}`,
      'EX', 2592000,
    );

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
    });

    const accessToken = await reply.jwtSign(
      { userId: payload.userId, tenantId: payload.tenantId },
      { expiresIn: process.env['JWT_ACCESS_TTL'] ?? '15m' },
    );

    return { accessToken };
  });
};
