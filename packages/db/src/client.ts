import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createId } from '@paralleldrive/cuid2';
import { getTenantContext } from './context.js';

// Prisma 7 uses the WASM-based "client" engine which requires a driver adapter.
// PrismaPg bridges the @prisma/client to the pg (node-postgres) driver.
// DATABASE_URL must be set in the environment.
function createAdapter() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('[DB] DATABASE_URL environment variable is required');
  }
  return new PrismaPg({ connectionString: url });
}

// Models that require tenant isolation (Prisma uses PascalCase for model names in $extends)
// NEVER add AuditLog, Tenant, User — they have no tenantId or are queried before context exists
const TENANT_SCOPED_MODELS = new Set([
  'Patient', 'Visit', 'Treatment', 'Campaign', 'Message',
  'Conversation', 'ChatMessage', 'Appointment', 'AiConfig',
]);

// Models where mutations generate audit log entries (subset of TENANT_SCOPED_MODELS)
const AUDITED_MODELS = new Set([
  'Patient', 'Visit', 'Treatment', 'Conversation', 'ChatMessage', 'Appointment',
]);

const WRITE_OPERATIONS = new Set([
  'create', 'update', 'delete', 'upsert',
  'createMany', 'updateMany', 'deleteMany',
]);

const READ_OPERATIONS = new Set([
  'findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy',
]);

// Base client WITHOUT $extends — used for audit log writes to prevent infinite recursion.
// See RESEARCH.md Pitfall 5: writing audit logs via the extended `prisma` client would
// re-enter $allOperations → deadlock. Use baseClient for ALL internal writes.
// Prisma 7: adapter required — uses PrismaPg with pg driver (WASM engine, no binary).
export const baseClient = new PrismaClient({
  adapter: createAdapter(),
  log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
});

export const prisma = baseClient.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: {
        model: string | undefined;
        operation: string;
        args: Record<string, unknown>;
        query: (args: Record<string, unknown>) => Promise<unknown>;
      }) {
        // Skip non-tenant-scoped models (AuditLog, Tenant, User, and undefined).
        // These are either global (Tenant), auth-layer (User), or internal (AuditLog).
        // Calling getTenantContext() for them would throw during auth setup.
        if (!model || !TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }

        // Fail-fast: require tenant context for ALL scoped model operations.
        // throws '[SECURITY] Tenant context required but not active.' if ALS context missing
        const ctx = getTenantContext();

        // Inject tenantId into WHERE clause for read operations
        if (READ_OPERATIONS.has(operation)) {
          args = {
            ...args,
            where: { ...(args['where'] as Record<string, unknown> ?? {}), tenantId: ctx.tenantId },
          };
        }

        // Inject tenantId into data payload for create operations (no `where` on create)
        if (operation === 'create' || operation === 'createMany') {
          args = {
            ...args,
            data: { ...(args['data'] as Record<string, unknown> ?? {}), tenantId: ctx.tenantId },
          };
        }

        // Inject tenantId into WHERE clause for write operations that support it
        // (update, delete, upsert, updateMany, deleteMany — NOT create/createMany)
        const WRITE_WITH_WHERE = new Set(['update', 'delete', 'upsert', 'updateMany', 'deleteMany']);
        if (WRITE_WITH_WHERE.has(operation)) {
          args = {
            ...args,
            where: { ...(args['where'] as Record<string, unknown> ?? {}), tenantId: ctx.tenantId },
          };

          // Inject tenantId into create side of upsert (update side keeps as-is)
          if (operation === 'upsert') {
            args = {
              ...args,
              create: { ...(args['create'] as Record<string, unknown> ?? {}), tenantId: ctx.tenantId },
              update: args['update'],
            };
          }
        }

        const result = await query(args);

        // Write audit log for mutations on audited models.
        // CRITICAL: Must use baseClient (NOT prisma) to prevent infinite recursion.
        // LGPD art. 11: metadata MUST NOT contain PII (no full_name, phone_normalized,
        // birth_date, email, cpf). Only store operation metadata.
        if (AUDITED_MODELS.has(model) && WRITE_OPERATIONS.has(operation)) {
          const entityId = (result as { id?: string } | null)?.id ?? 'batch';
          await baseClient.auditLog.create({
            data: {
              id: createId(),
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              action: operation,
              entity: model,
              entityId,
              metadata: {}, // NEVER put PII here — LGPD art. 11
            },
          });
        }

        return result;
      },
    },
  },
});

export type PrismaExtended = typeof prisma;
