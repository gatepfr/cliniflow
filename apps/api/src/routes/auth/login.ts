import type { FastifyPluginAsync } from 'fastify';
import { LoginSchema, AppError, createId } from '@clinicaflow/shared';
import { baseClient } from '@clinicaflow/db';
import { verifyPassword } from '../../lib/password.js';
import { redis } from '../../lib/redis.js';

export const loginRoute: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Dados inválidos', 400);
    }
    const { email, password } = result.data;

    const user = await baseClient.user.findUnique({ where: { email } });
    if (!user) {
      // Avoid timing oracle — still run bcrypt even if user not found (T-1-PLAN06-01)
      await verifyPassword('dummy', '$2a$12$invalidhashforfailtiming000000000000000000000000000000');
      throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 401);
    }

    const accessToken = await reply.jwtSign(
      { userId: user.id, tenantId: user.tenantId },
      { expiresIn: process.env['JWT_ACCESS_TTL'] ?? '15m' },
    );
    const refreshToken = await reply.jwtSign(
      { userId: user.id, tenantId: user.tenantId, tokenId: createId() },
      { expiresIn: '30d' },
    );

    await redis.set(
      `token:${refreshToken}`,
      `${user.id}:${user.tenantId}`,
      'EX', 2592000,
    );

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
    });

    return { accessToken };
  });
};
