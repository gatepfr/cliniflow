import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

export interface TenantCtx {
  tenantId: string;
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantCtx?: TenantCtx;
  }
}

const tenantPlugin: FastifyPluginAsync = async (app) => {
  // This hook runs AFTER JWT verification (which decorates request.user)
  // Per RESEARCH.md Pitfall 2: attach to request object, NOT AsyncLocalStorage in onRequest
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const user = request.user as { userId?: string; tenantId?: string } | undefined;
    if (user?.tenantId && user?.userId) {
      request.tenantCtx = {
        tenantId: user.tenantId,
        userId: user.userId,
      };
    }
    // If no user context, tenantCtx remains undefined.
    // Routes requiring tenant context must call authenticate first.
  });
};

export default fp(tenantPlugin, { name: 'tenant', dependencies: ['auth'] });
export { tenantPlugin };
