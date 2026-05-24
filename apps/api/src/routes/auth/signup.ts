import type { FastifyPluginAsync } from 'fastify';
import { SignupSchema, AppError, createId } from '@clinicaflow/shared';
import { baseClient } from '@clinicaflow/db';
import { hashPassword } from '../../lib/password.js';
import { redis } from '../../lib/redis.js';

export const signupRoute: FastifyPluginAsync = async (app) => {
  app.post('/signup', async (request, reply) => {
    const result = SignupSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Dados inválidos', 400);
    }
    const { tenantName, email, password, name } = result.data;

    // Check email uniqueness
    const existing = await baseClient.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('EMAIL_IN_USE', 'Este e-mail já está em uso', 409);
    }

    const tenantId = createId();
    const userId = createId();
    const passwordHash = await hashPassword(password);

    // Create tenant + owner user in a transaction
    await baseClient.$transaction([
      baseClient.tenant.create({
        data: { id: tenantId, name: tenantName },
      }),
      baseClient.user.create({
        data: { id: userId, tenantId, email, passwordHash, role: 'owner', name },
      }),
    ]);

    // Issue tokens
    const accessToken = await reply.jwtSign(
      { userId, tenantId },
      { expiresIn: process.env['JWT_ACCESS_TTL'] ?? '15m' },
    );
    const refreshTokenId = createId();
    const refreshToken = await reply.jwtSign(
      { userId, tenantId, tokenId: refreshTokenId },
      { expiresIn: '30d' },
    );

    // Store refresh token in Redis — key per token (D-03)
    await redis.set(
      `token:${refreshToken}`,
      `${userId}:${tenantId}`,
      'EX', 2592000, // 30 days — D-04
    );

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
    });

    return reply.code(201).send({ accessToken });
  });
};
