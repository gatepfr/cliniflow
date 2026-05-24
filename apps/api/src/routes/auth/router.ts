import type { FastifyPluginAsync } from 'fastify';
import { signupRoute } from './signup.js';
import { loginRoute } from './login.js';
import { refreshRoute } from './refresh.js';
import { logoutRoute } from './logout.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  await app.register(signupRoute);
  await app.register(loginRoute);
  await app.register(refreshRoute);
  await app.register(logoutRoute);
};
