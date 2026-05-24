import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCookie);

  await app.register(fastifyJwt, {
    secret: process.env['JWT_ACCESS_SECRET']!,
    sign: {
      expiresIn: process.env['JWT_ACCESS_TTL'] ?? '15m',
    },
  });

  // Decorate with authenticate preHandler
  app.decorate('authenticate', async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
};

export default fp(authPlugin, { name: 'auth' });
export { authPlugin };
