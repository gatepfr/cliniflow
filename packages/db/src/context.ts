import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      '[SECURITY] Tenant context required but not active. ' +
      'All Prisma operations must run within a tenantStorage.run() scope.'
    );
  }
  return ctx;
}
