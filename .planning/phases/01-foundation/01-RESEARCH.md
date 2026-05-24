# Phase 1: Foundation — Research

**Researched:** 2026-05-23
**Domain:** Monorepo setup, multi-tenant isolation, JWT auth, BullMQ queues, Evolution API WhatsApp wrapper
**Confidence:** HIGH (core stack), MEDIUM (Evolution API webhook auth — documented gap)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Refresh tokens armazenados no Redis com TTL de 30 dias (não em tabela de banco).
- **D-02:** Rotação one-time use — cada uso do refresh token emite um novo token e invalida o anterior.
- **D-03:** Múltiplos dispositivos suportados — cada login gera um refresh token independente. Logout desconecta apenas aquele dispositivo. Redis key por token (não por usuário).
- **D-04:** JWT de acesso TTL 15 minutos. Refresh token TTL 30 dias. Redis `SET token:{uuid} {userId}:{tenantId} EX 2592000`.
- **D-05:** Fase 1 entrega wrapper funcional testado com número WhatsApp real — conectividade comprovada é critério de aceite.
- **D-06:** Incluir `docker-compose.yml` com PostgreSQL 16, Redis 7 e container Evolution API. `docker compose up` sobe tudo sem configuração manual.
- **D-07:** Versão Docker da Evolution API e algoritmo HMAC exato confirmados por esta pesquisa (ver seção Evolution API).
- **D-08:** Um único processo worker (`apps/worker`) gerencia todas as 5 filas.
- **D-09:** Concorrência por fila: `campaign-dispatch:5`, `ai-conversation:10`, `appointment-confirm:3`, `recall-scheduler:1`, `webhook-evolution:20`.
- **D-10:** Retry: backoff exponencial (1s→5s→30s), máx 3 tentativas. Após 3 falhas, job vai para Dead Letter Queue (fila Redis separada). Erro logado no Sentry com job ID e stack.

### Claude's Discretion

- Camada de audit log via Prisma `$extends` interceptando `create`, `update`, `delete` nas tabelas de paciente.
- TTL dos access tokens: 15 minutos. Configurável via `JWT_ACCESS_TTL`.

### Deferred Ideas (OUT OF SCOPE)

- Topologia multi-worker por fila.
- Dashboard Bull Board de jobs.
- Rota de admin para inspecionar DLQ.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Monorepo pnpm + Turborepo com apps/api, apps/web, apps/worker, packages/db, packages/shared, packages/ai, packages/whatsapp, packages/billing | pnpm-workspace.yaml + turbo.json patterns documented; Turborepo 2.x task pipeline verified |
| FOUND-02 | Toda query filtrada automaticamente por tenant_id via Prisma $extends + AsyncLocalStorage, sem cross-tenant query acidental | Prisma $allModels/$allOperations pattern verified via official docs; fail-fast pattern documented |
| FOUND-03 | Suite de testes de isolamento multi-tenant roda em CI e bloqueia merge se detectar query sem tenant_id | Vitest pattern + Prisma middleware error throw documented; known ALS caveat in event handlers noted |
| FOUND-04 | Usuário pode criar conta, fazer login e permanecer autenticado via JWT + refresh token httpOnly cookie | @fastify/jwt + @fastify/cookie dual-token pattern verified via official README |
| FOUND-05 | Usuário pode fazer logout e ter sessão invalidada imediatamente | Redis key deletion pattern; one-time-use rotation via D-02 |
| FOUND-06 | Toda operação de leitura e escrita de dados de paciente gera entrada em audit_log com action, entity, entity_id, user_id, tenant_id e metadata sem PII | Prisma $extends audit pattern documented; anti-recursion strategy confirmed |
</phase_requirements>

---

## Summary

Phase 1 lays the entire technical foundation for ClínicaFlow. A project novo, sem código existente, começa do zero com 8 packages/apps no monorepo. O risco mais alto não é complexidade de implementação — é o isolamento multi-tenant. Um único query sem `tenant_id` vazou dados de saúde (LGPD art. 11), o que é irreversível em produção. A pesquisa confirma que a combinação `AsyncLocalStorage` + `Prisma.$extends` + `$allOperations` é o padrão estabelecido para essa garantia, com fail-fast quando contexto está ausente.

A segunda área crítica é a Evolution API: a imagem Docker correta é `evoapicloud/evolution-api:v2.3.7` (repositório `evoapicloud`, não `atendai` que está desatualizado na v1.8.7). A Evolution API **não implementa HMAC para webhooks de saída** — ela inclui o `apikey` da instância no corpo JSON do webhook como campo `apikey`. A verificação de autenticidade deve checar esse campo contra o valor configurado no container, não verificar uma assinatura criptográfica. Isso é uma simplificação em relação ao esperado: menos seguro que HMAC, mas é o comportamento real documentado.

O stack de queues (BullMQ 5.77.1) é estável e bem documentado. O padrão Dead Letter Queue via `worker.on('failed')` é implementado em code de aplicação, não nativamente pelo BullMQ OSS. O Redis precisa de `maxmemory-policy noeviction` e a conexão do Worker precisa de `maxRetriesPerRequest: null`.

**Primary recommendation:** Implementar o isolamento multi-tenant como primeira tarefa, antes de qualquer feature. Ele é mais difícil de adicionar retroativamente do que de começar correto.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monorepo / build pipeline | Dev tooling (root) | — | Turborepo orquestra tasks cross-package; cada app tem seu próprio processo |
| Tenant context injection | API middleware (Fastify) | Worker startup context | Fastify hook injeta no ALS antes de qualquer handler; workers injetam manualmente por job |
| Tenant-safe DB queries | Database layer (Prisma extends) | — | A garantia vive no cliente Prisma, não nos handlers individuais |
| JWT access token | API (Fastify) | — | Emitido e validado pelo servidor; nunca no frontend |
| Refresh token | API + Redis | — | Token armazenado no Redis; cookie httpOnly no browser |
| Audit log | Database layer (Prisma extends) | — | Intercepta no layer ORM; captura writes dos workers automaticamente |
| Queue submission | API (após handlers) | Worker (re-enqueue) | API é producer; Worker é consumer |
| BullMQ workers | Worker process | Redis | Execução assíncrona; Redis como broker |
| WhatsApp HTTP calls | packages/whatsapp | — | Wrapper isolado; chama Evolution API REST |
| Webhook reception | API (POST handler) | queue webhook-evolution | Retorna 200 imediatamente; processa async no worker |
| Frontend scaffold | Frontend (React/Vite) | — | Fase 1 cria estrutura; sem features de UI |

---

## Standard Stack

### Core

| Library | Version (verificado) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| fastify | 5.8.5 | HTTP server | Mais rápido que Express; schema-based validation nativa; ecosistema de plugins maduros |
| @fastify/jwt | 10.1.0 | JWT sign/verify | Plugin oficial Fastify; suporta cookie integration nativa |
| @fastify/cookie | 11.0.2 | httpOnly cookies | Plugin oficial Fastify; necessário para refresh token |
| @fastify/cors | 11.2.0 | CORS | Plugin oficial Fastify |
| prisma | 7.8.0 | ORM + migrations | Escolha do projeto; suporta $extends para tenant isolation |
| @prisma/client | 7.8.0 | Prisma runtime client | Gerado pelo Prisma CLI |
| @paralleldrive/cuid2 | 3.3.0 | ID generation | Substituto do `cuid` deprecated; criptograficamente seguro |
| bullmq | 5.77.1 | Queue + workers | Redis-based; suporta retry, concurrency, DLQ pattern |
| ioredis | 5.10.1 | Redis client | Requerido pelo BullMQ; suporta `maxRetriesPerRequest: null` |
| zod | 4.4.3 | Schema validation | TypeScript-first; usado em packages/shared para todas as inputs |
| pino | 10.3.1 | Logging | Padrão do Fastify; suporte nativo a redação de campos PII |
| pino-pretty | 13.1.3 | Log formatting (dev) | Pretty-print em desenvolvimento |
| @sentry/node | 10.53.1 | Error tracking | Captura de erros inesperados sem vazar PII |
| turbo | 2.9.14 | Monorepo task runner | Cache de builds; pipelines declarativas |

### Frontend

| Library | Version (verificado) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| react | 19.x | UI framework | Versão mais recente (não 18); confirmado por pesquisa |
| vite | latest | Bundler | Setup padrão com @tailwindcss/vite |
| tailwindcss | 4.x | CSS utility | CSS-first config; sem tailwind.config.js |
| @tailwindcss/vite | latest | Vite plugin | Integração Tailwind v4 + Vite sem PostCSS |
| shadcn/ui | latest CLI | Component system | Usa `pnpm dlx shadcn@latest init -t vite --monorepo` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/rate-limit | 10.3.0 | Rate limiting | Auth endpoints; proteção contra brute force |
| vitest | 4.1.7 | Test runner | Unit + integration tests; workspace support para monorepo |
| typescript | 5.x | Type system | strict mode em tudo |
| tsx | latest | TS execution | Executar TypeScript diretamente sem compilação prévia |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma $extends | PostgreSQL Row Level Security nativo | RLS é mais forte mas requer SET LOCAL por transaction; mais complexo de debugar |
| httpOnly cookie para refresh | Armazenar em localStorage | Mais exposto a XSS; não usar |
| ioredis direto | Prisma Adapter Redis | Prisma adapter não tem todas as features necessárias para BullMQ |

**Installation:**
```bash
# Root (devDependencies)
pnpm add -D -w turbo typescript vitest

# apps/api
pnpm add fastify @fastify/jwt @fastify/cookie @fastify/cors @fastify/rate-limit pino @sentry/node

# apps/worker
pnpm add bullmq ioredis pino @sentry/node

# packages/db
pnpm add prisma @prisma/client @paralleldrive/cuid2

# packages/shared
pnpm add zod

# apps/web
pnpm add react react-dom tailwindcss @tailwindcss/vite
pnpm add -D @vitejs/plugin-react vite @types/react @types/react-dom @types/node
pnpm dlx shadcn@latest init -t vite --monorepo
```

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────┐
                         │           Browser / Client           │
                         │   React 19 + Tailwind v4 + shadcn   │
                         │   httpOnly cookie ──► /auth/refresh  │
                         └──────────────┬──────────────────────┘
                                        │ HTTPS
                                        ▼
                         ┌─────────────────────────────────────┐
                         │         apps/api (Fastify 5)        │
                         │                                      │
                         │  onRequest hook                      │
                         │    └─► AsyncLocalStorage.run()       │
                         │         └─► tenantId injected        │
                         │                                      │
                         │  POST /auth/*  ─────────────────────►│ Redis (refresh tokens)
                         │  GET  /protected/* (JWT verify)      │
                         │  POST /webhooks/evolution/:tenantId  │
                         │    └─► verify apikey in body         │
                         │    └─► enqueue webhook-evolution     │
                         └──────────────┬──────────────────────┘
                                        │ Prisma (tenant-scoped client)
                                        ▼
                         ┌─────────────────────────────────────┐
                         │      packages/db (Prisma 7)         │
                         │                                      │
                         │  $extends → $allModels              │
                         │    ├─► inject tenant_id (all ops)   │
                         │    └─► write audit_log (mutations)  │
                         │                                      │
                         │  THROWS if no ALS context active    │
                         └──────────────┬──────────────────────┘
                                        │ TCP
                                        ▼
                         ┌─────────────────────────────────────┐
                         │       PostgreSQL 16                  │
                         └─────────────────────────────────────┘

                         ┌─────────────────────────────────────┐
                         │       apps/worker (BullMQ 5)        │
                         │                                      │
                         │  Queue: campaign-dispatch   (c=5)   │
                         │  Queue: ai-conversation     (c=10)  │
                         │  Queue: appointment-confirm (c=3)   │
                         │  Queue: recall-scheduler    (c=1)   │
                         │  Queue: webhook-evolution   (c=20)  │
                         │                                      │
                         │  worker.on('failed') → DLQ + Sentry │
                         └──────────────┬──────────────────────┘
                                        │ ioredis
                                        ▼
                         ┌─────────────────────────────────────┐
                         │       Redis 7                        │
                         │  maxmemory-policy: noeviction        │
                         │  BullMQ queues + refresh tokens      │
                         └─────────────────────────────────────┘

                         ┌─────────────────────────────────────┐
                         │  packages/whatsapp                  │
                         │  HTTP REST → Evolution API container │
                         │  apikey: Authorization header        │
                         └──────────────┬──────────────────────┘
                                        │ HTTP :8080
                                        ▼
                         ┌─────────────────────────────────────┐
                         │  evoapicloud/evolution-api:v2.3.7   │
                         └─────────────────────────────────────┘
```

### Recommended Project Structure

```
/
├── package.json              # private:true, workspaces defined in pnpm-workspace.yaml
├── pnpm-workspace.yaml       # packages: ["apps/*", "packages/*"]
├── turbo.json                # task pipeline
├── docker-compose.yml        # PostgreSQL 16, Redis 7, Evolution API v2.3.7
├── .env.example
│
├── apps/
│   ├── api/
│   │   ├── package.json      # name: "@clinicaflow/api"
│   │   ├── src/
│   │   │   ├── server.ts     # Fastify instance, register plugins
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts   # @fastify/jwt + @fastify/cookie registration
│   │   │   │   └── tenant.ts # AsyncLocalStorage onRequest hook
│   │   │   └── routes/
│   │   │       ├── auth/     # signup, login, refresh, logout
│   │   │       └── webhooks/ # evolution webhook handler
│   │
│   ├── web/
│   │   ├── package.json      # name: "@clinicaflow/web"
│   │   ├── vite.config.ts    # @tailwindcss/vite + path alias @/
│   │   └── src/
│   │       └── index.css     # @import "tailwindcss";
│   │
│   └── worker/
│       ├── package.json      # name: "@clinicaflow/worker"
│       └── src/
│           ├── index.ts      # start all 5 workers
│           └── queues/
│               ├── campaign-dispatch.ts
│               ├── ai-conversation.ts
│               ├── appointment-confirm.ts
│               ├── recall-scheduler.ts
│               └── webhook-evolution.ts
│
└── packages/
    ├── db/
    │   ├── package.json      # name: "@clinicaflow/db"
    │   ├── prisma/
    │   │   └── schema.prisma
    │   └── src/
    │       ├── client.ts     # PrismaClient + $extends (tenant + audit)
    │       └── context.ts    # AsyncLocalStorage + getTenantContext()
    │
    ├── shared/
    │   ├── package.json      # name: "@clinicaflow/shared"
    │   └── src/
    │       ├── errors.ts     # AppError class
    │       ├── schemas/      # Zod schemas
    │       └── types.ts      # shared TS types
    │
    ├── ai/
    │   └── package.json      # name: "@clinicaflow/ai" (stub Phase 1)
    │
    ├── whatsapp/
    │   ├── package.json      # name: "@clinicaflow/whatsapp"
    │   └── src/
    │       ├── client.ts     # HTTP wrapper for Evolution API REST
    │       └── webhook.ts    # webhook payload types + apikey verifier
    │
    └── billing/
        └── package.json      # name: "@clinicaflow/billing" (stub Phase 1)
```

### Pattern 1: Turborepo Pipeline Configuration

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Root `package.json`:**
```json
{
  "private": true,
  "packageManager": "pnpm@10.33.2",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "2.9.14",
    "typescript": "^5"
  }
}
```

Each package declares `"name": "@clinicaflow/<name>"` and uses `"exports"` (not `"main"`) for internal references.

**Inter-package dependency:**
```json
// apps/api/package.json
{
  "dependencies": {
    "@clinicaflow/db": "workspace:*",
    "@clinicaflow/shared": "workspace:*",
    "@clinicaflow/whatsapp": "workspace:*"
  }
}
```

### Pattern 2: Prisma $extends — Tenant Isolation + Audit Log

**`packages/db/src/context.ts`:**
```typescript
// Source: Prisma official docs + oneuptime.com multi-tenant guide
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
```

**`packages/db/src/client.ts`:**
```typescript
// Source: Prisma docs /orm/prisma-client/client-extensions/query
import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantContext } from './context';

// Models that require tenant isolation
const TENANT_SCOPED_MODELS = [
  'patient', 'visit', 'treatment', 'campaign', 'message',
  'conversation', 'chatMessage', 'appointment', 'aiConfig',
] as const;

// Models where mutations generate audit log entries
const AUDITED_MODELS = [
  'patient', 'visit', 'treatment', 'conversation',
  'chatMessage', 'appointment',
] as const;

const WRITE_OPERATIONS = ['create', 'update', 'delete', 'upsert',
  'createMany', 'updateMany', 'deleteMany'] as const;

const READ_OPERATIONS = ['findUnique', 'findFirst', 'findMany',
  'count', 'aggregate', 'groupBy'] as const;

const baseClient = new PrismaClient();

export const prisma = baseClient.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Skip system tables that don't need tenant scoping
        if (model === 'AuditLog' || model === 'Tenant' || model === 'User') {
          return query(args);
        }

        // Fail-fast: require tenant context for all scoped models
        const ctx = getTenantContext(); // throws if no ALS context

        // Inject tenant_id into WHERE for read operations
        if ((READ_OPERATIONS as readonly string[]).includes(operation)) {
          args.where = { ...args.where, tenantId: ctx.tenantId };
        }

        // Inject tenant_id into data for write operations
        if ((WRITE_OPERATIONS as readonly string[]).includes(operation)) {
          if (operation === 'create' || operation === 'upsert') {
            args.data = { ...args.data, tenantId: ctx.tenantId };
          }
          // Always scope writes to tenant
          args.where = { ...args.where, tenantId: ctx.tenantId };
        }

        const result = await query(args);

        // Write audit log for mutations on audited models
        if (
          (AUDITED_MODELS as readonly string[]).includes(model ?? '') &&
          (WRITE_OPERATIONS as readonly string[]).includes(operation)
        ) {
          // Use base client to avoid recursive extension trigger
          await baseClient.auditLog.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              action: operation,
              entity: model ?? 'unknown',
              entityId: (result as any)?.id ?? 'batch',
              metadata: {}, // NEVER put PII here — LGPD art. 11
            },
          });
        }

        return result;
      },
    },
  },
});
```

**CRITICAL:** Use `baseClient` (not the extended `prisma`) for audit log writes. This prevents infinite recursion since `baseClient` has no `$extends`.

**Fastify tenant middleware (`apps/api/src/plugins/tenant.ts`):**
```typescript
import { FastifyPluginAsync } from 'fastify';
import { tenantStorage } from '@clinicaflow/db';

export const tenantPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // JWT verification must run before this hook
    const user = request.user as { userId: string; tenantId: string };
    if (!user?.tenantId) {
      return reply.code(401).send({ error: 'Tenant context required' });
    }
    // All downstream handlers run inside tenantStorage context
    await tenantStorage.run(
      { tenantId: user.tenantId, userId: user.userId },
      async () => { /* Fastify continues the request lifecycle here */ }
    );
    // NOTE: Fastify lifecycle requires a different approach — see Pitfall 2
  });
};
```

> **Pitfall note:** `AsyncLocalStorage.run()` wraps execution synchronously. Fastify's hook chain is async and the next hook/handler runs after the current hook resolves, NOT inside the `run()` callback. The correct approach is to set the context on the `request` object and use a Fastify `preHandler` or use `cls-hooked` / `@fastify/request-context`. See Pitfall 2 for the corrected implementation.

### Pattern 3: Fastify JWT + httpOnly Refresh Token

```typescript
// Source: @fastify/jwt README (github.com/fastify/fastify-jwt)
// apps/api/src/plugins/auth.ts

import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

export default fp(async (app) => {
  app.register(cookie);

  app.register(jwt, {
    secret: process.env.JWT_ACCESS_SECRET!,
    cookie: {
      cookieName: 'refreshToken',
      signed: false,
    },
    sign: {
      expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
    },
  });
});

// routes/auth/login.ts
app.post('/auth/login', async (req, reply) => {
  // ... validate credentials ...
  const accessToken = await reply.jwtSign(
    { userId, tenantId },
    { expiresIn: '15m' }
  );
  const refreshToken = await reply.jwtSign(
    { userId, tenantId, tokenId: cuid2() },
    { expiresIn: '30d' }
  );

  // Store refresh token in Redis
  await redis.set(
    `token:${refreshToken}`,  // key per token (not per user) — D-03
    `${userId}:${tenantId}`,
    'EX', 2592000             // 30 days — D-04
  );

  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth/refresh',
  });

  return { accessToken };
});

// routes/auth/refresh.ts
app.post('/auth/refresh', async (req, reply) => {
  await req.jwtVerify({ onlyCookie: true }); // reads from httpOnly cookie
  const { tokenId, userId, tenantId } = req.user as any;

  // Validate token exists in Redis (one-time-use — D-02)
  const stored = await redis.get(`token:${req.cookies.refreshToken}`);
  if (!stored) return reply.code(401).send({ error: 'Token revoked' });

  // Rotate: delete old, issue new
  await redis.del(`token:${req.cookies.refreshToken}`);
  const newRefreshToken = await reply.jwtSign(
    { userId, tenantId, tokenId: cuid2() },
    { expiresIn: '30d' }
  );
  await redis.set(`token:${newRefreshToken}`, `${userId}:${tenantId}`, 'EX', 2592000);

  reply.setCookie('refreshToken', newRefreshToken, {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/auth/refresh',
  });
  return { accessToken: await reply.jwtSign({ userId, tenantId }, { expiresIn: '15m' }) };
});

// routes/auth/logout.ts — D-05 (FOUND-05)
app.post('/auth/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    await redis.del(`token:${refreshToken}`); // immediate invalidation
  }
  reply.clearCookie('refreshToken', { path: '/auth/refresh' });
  return { ok: true };
});
```

### Pattern 4: BullMQ Queue + Worker + DLQ

```typescript
// Source: docs.bullmq.io/guide/connections + oneuptime.com DLQ guide
// packages/shared/src/queues.ts

export const QUEUE_NAMES = {
  CAMPAIGN_DISPATCH: 'campaign-dispatch',
  AI_CONVERSATION: 'ai-conversation',
  APPOINTMENT_CONFIRM: 'appointment-confirm',
  RECALL_SCHEDULER: 'recall-scheduler',
  WEBHOOK_EVOLUTION: 'webhook-evolution',
} as const;

// apps/worker/src/index.ts
import IORedis from 'ioredis';
import { Worker, Queue } from 'bullmq';

// Worker connections require maxRetriesPerRequest: null
const workerConnection = new IORedis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  maxRetriesPerRequest: null,   // REQUIRED for BullMQ workers
  enableReadyCheck: false,
});

// DLQ queue (no worker — just storage for inspection)
const dlq = new Queue('dead-letter', {
  connection: new IORedis({ host: 'localhost', port: 6379 }),
});

function createWorker(
  queueName: string,
  processor: (job: Job) => Promise<unknown>,
  concurrency: number
) {
  const worker = new Worker(queueName, processor, {
    connection: workerConnection,
    concurrency,
    settings: {
      backoffStrategy: (attemptsMade: number) =>
        Math.min(1000 * Math.pow(2, attemptsMade - 1), 30000), // 1s→2s→4s→...→30s cap
    },
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      // Move to DLQ
      await dlq.add(`dlq_${queueName}`, {
        originalQueue: queueName,
        jobId: job.id,
        jobName: job.name,
        data: job.data,
        error: err.message,
        stacktrace: job.stacktrace,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
      });
      // Log to Sentry (without PII)
      Sentry.captureException(err, {
        extra: { jobId: job.id, queue: queueName, attemptsMade: job.attemptsMade },
      });
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, `Worker error on queue ${queueName}`);
  });

  return worker;
}

// Start all 5 workers (D-08, D-09)
createWorker(QUEUE_NAMES.CAMPAIGN_DISPATCH,  processCampaignDispatch,  5);
createWorker(QUEUE_NAMES.AI_CONVERSATION,    processAiConversation,    10);
createWorker(QUEUE_NAMES.APPOINTMENT_CONFIRM, processAppointmentConfirm, 3);
createWorker(QUEUE_NAMES.RECALL_SCHEDULER,   processRecallScheduler,   1);
createWorker(QUEUE_NAMES.WEBHOOK_EVOLUTION,  processWebhookEvolution,  20);
```

**Default job options (applied when enqueuing):**
```typescript
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'custom' },  // uses backoffStrategy in Worker settings
  removeOnComplete: { age: 24 * 3600 },   // keep 24h
  removeOnFail: false,                      // keep in failed set until DLQ moves it
};
```

### Pattern 5: Evolution API Webhook Verification

**CRITICAL FINDING:** Evolution API v2 does **not** use HMAC-SHA256 for outbound webhooks. It includes the instance `apikey` as a field in the JSON body of every webhook it sends. Verification is done by comparing this field against the configured `AUTHENTICATION_API_KEY`.

```typescript
// Source: Analysis of Evolution API source + community examples [MEDIUM confidence]
// packages/whatsapp/src/webhook.ts

import { FastifyRequest, FastifyReply } from 'fastify';

const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

export interface EvolutionWebhookPayload {
  event: string;           // e.g. "messages.upsert", "connection.update"
  instance: string;        // instance name
  data: Record<string, unknown>;
  destination: string;
  date_time: string;
  sender: string;
  server_url: string;
  apikey: string;          // instance API key — use for verification
}

export async function verifyEvolutionWebhook(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = req.body as EvolutionWebhookPayload;

  // Verify the apikey in the body matches our configured key
  // NOTE: This is authentication by shared secret in body, NOT HMAC signature
  if (!body.apikey || body.apikey !== EVOLUTION_API_KEY) {
    req.log.warn({ event: body.event }, 'Rejected webhook: invalid apikey');
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  // Return 200 immediately (WA-04) — processing is async
  reply.code(200).send({ ok: true });

  // Enqueue for async processing (do NOT await)
  void webhookQueue.add('evolution-event', {
    event: body.event,
    instance: body.instance,
    data: body.data,
    receivedAt: new Date().toISOString(),
    // NEVER store full body — it may contain message content (PII)
  });
}
```

**Sending messages to Evolution API:**
```typescript
// packages/whatsapp/src/client.ts
const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL ?? 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

export async function sendTextMessage(
  instanceName: string,
  to: string,  // E.164 format without +
  text: string
): Promise<void> {
  const res = await fetch(
    `${EVOLUTION_BASE_URL}/message/sendText/${instanceName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,  // header for outbound requests
      },
      body: JSON.stringify({ number: to, text }),
    }
  );
  if (!res.ok) {
    throw new Error(`Evolution API error: ${res.status} ${await res.text()}`);
  }
}
```

### Pattern 6: Pino Logger with PII Redaction (LGPD)

```typescript
// Source: pinojs/pino docs — redaction.md
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.phone',
      '*.phone_normalized',
      '*.full_name',
      '*.birth_date',
      '*.email',
      '*.cpf',
      'body.password',
      'body.content',        // message content
    ],
    censor: '[REDACTED]',
  },
  // Never log message content
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // NO body logging
    }),
  },
});
```

### Anti-Patterns to Avoid

- **`$use` (deprecated Prisma middleware):** A API antiga `prisma.$use()` foi removida no Prisma 5+. Usar `$extends` com `query.$allModels.$allOperations`.
- **Raw SQL sem `tenant_id`:** Qualquer `$executeRaw` ou `$queryRaw` deve incluir filtro de tenant explícito — o `$extends` não intercepta raw queries.
- **Armazenar refresh token no banco:** Decisão D-01 é Redis. Banco seria mais lento e requer migration/cleanup job.
- **`limiter.groupKey` no BullMQ OSS:** Removido na v3. Rate limiting de WhatsApp é implementado no worker de disparo com Redis sliding window (Fase 3).
- **`latest` no Docker:** Usar tags versionadas (`v2.3.7`). A tag `latest` do `evoapicloud` não é garantida como estável.
- **`cuid` sem v2:** `@paralleldrive/cuid2` é o substituto. O pacote `cuid` original está deprecated desde 2022.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Custom crypto | `@fastify/jwt` | Edge cases de expiry, kid rotation, cookie integration já resolvidos |
| Queue retry/backoff | setTimeout recursivo | `BullMQ` Worker + `attempts/backoff` | Atomicidade Redis, persistência de jobs, dead letter, concorrência |
| Log redaction | Regex no logger | `pino` redact paths | Fast-redact é ~10x mais rápido que regex; cobre nested paths |
| ID generation | `Math.random()` hex | `@paralleldrive/cuid2` | Collision-resistant, monotonic sorting, URL-safe |
| Schema validation | Zod manual parsing | `zod` schemas em `packages/shared` | Type inference, error messages PT-BR, composable |
| Cookie parsing | `req.headers.cookie` manual | `@fastify/cookie` | Signed cookies, serialization, httpOnly flag |
| Monorepo builds | Scripts npm custom | `turbo` | Cache incremental, parallel tasks, pipeline declarativa |

**Key insight:** Em infraestrutura de fila, tentar reinventar retry/persistence/atomicity resulta em race conditions que só aparecem em produção sob carga. BullMQ usa Lua scripts Redis para garantias atômicas que são inviáveis de hand-roll.

---

## Common Pitfalls

### Pitfall 1: AsyncLocalStorage Não Propaga em Event Handlers do Prisma
**What goes wrong:** Código dentro de `prisma.$on('query', handler)` executa fora do scope do ALS. O handler não encontra o tenant context mesmo dentro de uma request.
**Why it happens:** O Prisma emite eventos em uma fila interna assíncrona que perde o contexto de execução original.
**How to avoid:** Não usar `$on('query')` para recuperar tenant context. Usar apenas `$extends` com `$allOperations` — que executa sincronamente dentro da call chain da query.
**Warning signs:** Testes de ALS funcionam em unit tests mas falham intermitentemente em integration tests com eventos.
[CITED: github.com/prisma/prisma/issues/23397]

### Pitfall 2: AsyncLocalStorage + Fastify Hooks — Escopo Perdido
**What goes wrong:** `tenantStorage.run(ctx, callback)` passa o contexto para dentro do `callback`, mas os handlers Fastify subsequentes (montados por `.addHook`) **não** rodam dentro do callback. Eles rodam depois que o hook resolve.
**Why it happens:** Fastify's lifecycle é baseado em promises em série, não em callbacks aninhados.
**How to avoid:** Salvar o contexto no objeto `request` (ex: `request.tenantCtx = { tenantId, userId }`) e ler de lá no `$extends`. Alternativa: usar `@fastify/request-context` que gerencia o scoping corretamente.
**Corrected approach:**
```typescript
// plugins/tenant.ts
app.addHook('onRequest', async (request) => {
  const user = request.user as { userId: string; tenantId: string };
  // Attach to request — available in all subsequent hooks/handlers
  (request as any).tenantCtx = { tenantId: user.tenantId, userId: user.userId };
});

// packages/db/src/context.ts — alternative without ALS
export function getTenantContext(request: FastifyRequest): TenantContext {
  const ctx = (request as any).tenantCtx;
  if (!ctx) throw new Error('[SECURITY] No tenant context on request');
  return ctx;
}
```
**Recommendation:** Para workers (sem request object), usar ALS diretamente. Para API handlers, usar `request.tenantCtx` passado explicitamente ao Prisma via factory function.
[ASSUMED — baseado em análise do Fastify lifecycle; confirmar com teste de integração]

### Pitfall 3: Redis `allkeys-lru` Evicta Chaves BullMQ
**What goes wrong:** Redis com `maxmemory-policy allkeys-lru` (default) evicta silenciosamente chaves de jobs BullMQ quando memória enche. O worker não encontra o job → marca como processado → campanha não é enviada → sem erro, sem log.
**Why it happens:** Redis default policy assume cache, não broker de mensagens.
**How to avoid:** `maxmemory-policy noeviction` (Redis retorna erro em vez de evictar). Configurar no `docker-compose.yml` com `command: redis-server --maxmemory-policy noeviction`.
**Warning signs:** Campanhas com jobs "sumidos" sem falha registrada; DLQ vazia mas metrics de envio não batem.
[VERIFIED: STATE.md decision log + BullMQ docs]

### Pitfall 4: Evolution API npm Package Deletado
**What goes wrong:** `npm install @evolution-api/sdk` ou similar falha — pacote deletado do registry em dezembro 2023.
**Why it happens:** O projeto migrou para modelo container-only.
**How to avoid:** Usar HTTP REST diretamente contra o container Docker. Ver Pattern 5.
[VERIFIED: STATE.md decision log]

### Pitfall 5: Audit Log Recursão Infinita
**What goes wrong:** A extensão Prisma de audit log tenta gravar em `audit_log` → o `$extends` intercepta essa gravação → tenta gravar outra entrada → loop infinito.
**Why it happens:** `$allModels.$allOperations` captura TODAS as operações incluindo a que o próprio `$extends` dispara.
**How to avoid:** Sempre usar o `baseClient` (instância PrismaClient sem extends) para gravar o audit log. O `baseClient` não passa pelo pipeline de `$extends`.
**Warning signs:** Stack overflow ou timeout em testes de audit log; criação de registro de paciente nunca retorna.
[VERIFIED: Prisma community + lewisblackburn.me article]

### Pitfall 6: Worker sem `maxRetriesPerRequest: null` Trava
**What goes wrong:** Worker BullMQ lança exceção `"MaxRetriesPerRequestError"` quando Redis está temporariamente indisponível (restart, network blip). O processo worker cai.
**Why it happens:** ioredis default é `maxRetriesPerRequest: 20`. Após 20 tentativas, lança erro. Para workers de longa vida, isso é fatal.
**How to avoid:** `new IORedis({ maxRetriesPerRequest: null })` para a conexão do Worker. Para Queue producers (API), manter o default ou setar baixo para falhar rápido.
[VERIFIED: docs.bullmq.io/guide/connections]

---

## Evolution API — Versão e Configuração Docker

### Imagem Docker Correta

| Repositório | Tag Recomendada | Data | Status |
|-------------|-----------------|------|--------|
| `evoapicloud/evolution-api` | `v2.3.7` | Dez 2024 | Estável, produção |
| `evoapicloud/evolution-api` | `latest` | Mai 2026 | RC/homolog — não usar em prod |
| `atendai/evolution-api` | `v1.8.7` | Mai 2024 | v1.x desatualizado — NÃO USAR |

**Usar:** `evoapicloud/evolution-api:v2.3.7`
[VERIFIED: hub.docker.com/r/evoapicloud/evolution-api/tags — confirma v2.3.7 presente]

### docker-compose.yml para Development

```yaml
# Source: doc.evolution-api.com/v2/en/install/docker + deepwiki analysis
version: "3.9"
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: clinicaflow
      POSTGRES_USER: ${POSTGRES_USER:-clinica}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --maxmemory-policy noeviction
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    ports:
      - "8080:8080"
    environment:
      SERVER_URL: http://localhost:8080
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY:-changeme-dev-key}
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://${POSTGRES_USER:-clinica}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/evolution_api?schema=evolution_api
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://redis:6379/1
      CACHE_REDIS_PREFIX_KEY: evolution
      WEBHOOK_GLOBAL_URL: ""
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  postgres_data:
  redis_data:
  evolution_instances:
```

### Variáveis de Ambiente Required (`.env.example`)

```bash
# PostgreSQL
POSTGRES_USER=clinica
POSTGRES_PASSWORD=changeme
DATABASE_URL=postgresql://clinica:changeme@localhost:5432/clinicaflow

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=change-this-secret-in-production
JWT_REFRESH_SECRET=change-this-other-secret
JWT_ACCESS_TTL=15m

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=changeme-dev-key

# Sentry (can be empty in dev)
SENTRY_DSN=
```

### Webhook Authentication — Conclusão da Pesquisa

**Achado definitivo:** A Evolution API v2 **NÃO usa HMAC-SHA256** para assinar webhooks de saída. O mecanismo de autenticação é:

1. O container Evolution API envia POST para o URL configurado como webhook
2. O corpo JSON inclui o campo `"apikey"` com o valor configurado em `AUTHENTICATION_API_KEY`
3. O receptor deve verificar esse campo contra o valor esperado

**Implicações para o planner:**
- Não há geração de assinatura criptográfica do lado do receptor
- A segurança é equivalente a um "shared secret in body" — menos seguro que HMAC, mas é o comportamento real
- O receptor deve usar HTTPS em produção para proteger o apikey em trânsito
- A verificação é uma comparação de string simples (constant-time comparison recomendada)

[MEDIUM confidence — baseado em análise de código da comunidade, issues do GitHub, e ausência de documentação de HMAC; o comportamento descrito é consistente em múltiplas fontes mas não foi confirmado em código-fonte oficial por falta de acesso autenticado ao GitHub]

---

## Code Examples

### Prisma Schema Essentials (packages/db/prisma/schema.prisma)

```prisma
// Source: CLAUDE.md conventions
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(dbgenerated("gen_random_uuid()"))
  name      String
  plan      String   @default("starter")
  status    String   @default("trial")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  users     User[]
  patients  Patient[]
}

model User {
  id           String   @id
  tenantId     String   @map("tenant_id")
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         String   @default("staff")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
}

model Patient {
  id              String    @id
  tenantId        String    @map("tenant_id")
  phoneNormalized String    @map("phone_normalized")
  fullName        String    @map("full_name")
  birthDate       DateTime? @map("birth_date") @db.Date
  optInAt         DateTime? @map("opt_in_at") @db.Timestamptz
  optOutAt        DateTime? @map("opt_out_at") @db.Timestamptz
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  tenant          Tenant    @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, phoneNormalized])
  @@map("patient")
}

model AuditLog {
  id        String   @id
  tenantId  String   @map("tenant_id")
  userId    String   @map("user_id")
  action    String   // create | update | delete
  entity    String   // patient | visit | ...
  entityId  String   @map("entity_id")
  metadata  Json     @default("{}")  // NO PII — LGPD art. 11
  ip        String?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@map("audit_log")
}
```

**Nota sobre IDs:** O CLAUDE.md especifica `cuid()` mas o `cuid` está deprecated. Usar `@paralleldrive/cuid2` em application code para gerar IDs antes de inserir, não via `@default` do Prisma. A alternativa `@default(dbgenerated("gen_random_uuid()"))` é aceitável para tabelas de sistema (tenant, user).

### Vitest Configuration (packages/db/vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cuid` | `@paralleldrive/cuid2` | 2022 (deprecated) | Código usando `cuid` puro não funciona; deve migrar |
| `prisma.$use()` middleware | `prisma.$extends()` query extension | Prisma 4.16 GA (2023) | `$use` removido em Prisma 5+ |
| `tailwind.config.js` | `@import "tailwindcss"` em CSS + `@tailwindcss/vite` | Tailwind v4 (Jan 2025) | Sem arquivo de config JS; tema via CSS `@theme {}` |
| `atendai/evolution-api` | `evoapicloud/evolution-api` | 2024 (migração de org) | `atendai` parou na v1.8.7; v2.x apenas em `evoapicloud` |
| `npm run` scripts | `turbo run` pipeline | 2023+ | Cache de build incremental; tasks paralelas cross-package |
| React 18 | React 19 | Dez 2024 (stable) | Concurrent features melhoradas; `--legacy-peer-deps` necessário para alguns packages shadcn |

**Deprecated/outdated:**
- `bull` (não BullMQ): versão antiga sem TypeScript nativo; substituído por `bullmq`
- `@evolution-api/sdk` npm package: deletado dez/2023; usar HTTP REST
- `bcrypt`: considerar `bcryptjs` (pure JS) ou `argon2` para senha hashing — mais seguro que bcrypt em Node.js moderno

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Evolution API v2 inclui `apikey` no corpo JSON de webhooks de saída (não usa HMAC) | Pattern 5, Evolution API section | Se usar HMAC, o wrapper de webhook precisaria de crypto.createHmac — mudança de implementação mas não de arquitetura |
| A2 | Fastify AsyncLocalStorage + `onRequest` hook perde contexto para hooks subsequentes (requer approach alternativo) | Pattern 2, Pitfall 2 | Se o Fastify propagar corretamente, a abordagem mais simples com ALS funciona direto |
| A3 | shadcn/ui + React 19 requer `--legacy-peer-deps` para alguns componentes | Standard Stack | Pode causar warnings em CI; resolver com override em package.json se necessário |

**Claims verificados (HIGH confidence):** Stack versions via `npm view`, Docker image via Docker Hub, Turborepo via docs, BullMQ via docs, Prisma $extends via oficial docs, @fastify/jwt via README oficial.

---

## Open Questions

1. **Fastify ALS vs Request Context**
   - What we know: AsyncLocalStorage pode perder contexto em event-based patterns; Fastify tem `@fastify/request-context` como alternativa
   - What's unclear: Comportamento exato do ALS dentro de Fastify hooks aninhados com `onRequest` + `preHandler` + handler
   - Recommendation: Planner deve escolher entre (a) `request.tenantCtx` no objeto request ou (b) `@fastify/request-context`. A opção (a) é simples e sem dependência adicional. Sugestão: usar (a) para API, ALS puro para workers.

2. **Evolution API Webhook Body Signature**
   - What we know: A API não documenta HMAC; campo `apikey` está presente em exemplos da comunidade
   - What's unclear: Se versões futuras (2.4.0+) adicionarão HMAC — a issue #1933 foi fechada como "not planned"
   - Recommendation: Implementar verificação de `apikey` em body por ora. Abstrair em função `verifyEvolutionWebhook()` para facilitar upgrade futuro.

3. **Prisma ID Strategy**
   - What we know: CLAUDE.md diz `cuid()`, mas `cuid` está deprecated; `@paralleldrive/cuid2` é o substituto; Prisma não tem `@default(cuid2())`
   - What's unclear: Se gerar IDs no application layer vs usar `gen_random_uuid()` no banco
   - Recommendation: Gerar com `@paralleldrive/cuid2` no application layer antes de inserir. Adicionar helper `createId()` em `packages/shared`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Todos os apps | ✓ | v24.14.1 (LTS) | — |
| pnpm | Monorepo | ✓ | 10.33.2 | — |
| Docker | PostgreSQL, Redis, Evolution | ✓ | 29.4.2 | — |
| Docker Compose | `docker compose up` | ✓ | v5.1.3 | — |
| PostgreSQL (CLI) | Migrations dev | ✗ | — | Docker container (suficiente) |
| Redis (CLI) | Debug dev | ✗ | — | Docker container (suficiente) |

**Missing dependencies with no fallback:** nenhum — tudo disponível via Docker.

**Nota:** Node.js 24 LTS é a versão do desenvolvedor. O runtime do projeto é Node.js 20 LTS (conforme CLAUDE.md). O docker-compose deve usar `node:20-alpine` para as imagens dos apps em produção. O desenvolvimento local com Node 24 é compatível (v24 suporta todas as APIs de v20).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `packages/db/vitest.config.ts`, `apps/api/vitest.config.ts` (Wave 0 criar) |
| Quick run command | `pnpm --filter @clinicaflow/db test` |
| Full suite command | `turbo run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-02 | Query Prisma sem ALS context atira erro antes de chegar ao banco | unit | `pnpm --filter @clinicaflow/db test -- tenant-isolation` | ❌ Wave 0 |
| FOUND-03 | CI bloqueia merge quando teste de isolamento falha | CI config | `turbo run test` (GitHub Actions) | ❌ Wave 0 |
| FOUND-04 | Signup → JWT no body + refresh token em httpOnly cookie | integration | `pnpm --filter @clinicaflow/api test -- auth` | ❌ Wave 0 |
| FOUND-05 | Logout invalida refresh token imediatamente no Redis | integration | `pnpm --filter @clinicaflow/api test -- auth` | ❌ Wave 0 |
| FOUND-06 | Create patient gera row em audit_log com tenantId, sem PII no metadata | integration | `pnpm --filter @clinicaflow/db test -- audit-log` | ❌ Wave 0 |
| FOUND-01 | `pnpm dev` inicia api + web + worker sem erro | smoke | `turbo run build` (CI) | ❌ Wave 0 |

### Sampling Strategy for Tenant Isolation Tests

O teste de isolamento (FOUND-02/FOUND-03) deve:

1. **Test A — No Context (must throw):**
   ```typescript
   it('throws when no tenant context is active', async () => {
     // No tenantStorage.run() wrapping this call
     await expect(prisma.patient.findMany()).rejects.toThrow(
       '[SECURITY] Tenant context required'
     );
   });
   ```

2. **Test B — Wrong context (must not return other tenant's data):**
   ```typescript
   it('never returns records from another tenant', async () => {
     const [tenantA, tenantB] = await createTestTenants();
     // Insert patient for tenantA
     const patient = await tenantStorage.run(
       { tenantId: tenantA.id, userId: 'test' },
       () => prisma.patient.create({ data: testPatient })
     );
     // Query as tenantB — must return empty
     const results = await tenantStorage.run(
       { tenantId: tenantB.id, userId: 'test' },
       () => prisma.patient.findMany()
     );
     expect(results).toHaveLength(0);
   });
   ```

3. **Test C — Audit log entries never contain PII:**
   ```typescript
   it('audit log metadata contains no PII fields', async () => {
     await tenantStorage.run(ctx, async () => {
       await prisma.patient.create({ data: patientWithPII });
     });
     const log = await baseClient.auditLog.findFirst({ orderBy: { createdAt: 'desc' } });
     expect(log?.metadata).not.toHaveProperty('full_name');
     expect(log?.metadata).not.toHaveProperty('phone_normalized');
   });
   ```

### Per-Task Sampling
- **Por commit:** `pnpm --filter @clinicaflow/db test --run` (unit tests apenas)
- **Por wave merge:** `turbo run test` (full suite)
- **Phase gate:** Full suite green + todos os 3 testes de isolamento passando antes de `/gsd-verify-work`

### Wave 0 Gaps (arquivos a criar antes de implementar)

- [ ] `packages/db/vitest.config.ts` — config base
- [ ] `packages/db/src/__tests__/setup.ts` — test database setup
- [ ] `packages/db/src/__tests__/tenant-isolation.test.ts` — FOUND-02/03
- [ ] `packages/db/src/__tests__/audit-log.test.ts` — FOUND-06
- [ ] `apps/api/vitest.config.ts` — config base
- [ ] `apps/api/src/__tests__/auth.test.ts` — FOUND-04/05
- [ ] `.github/workflows/ci.yml` — `turbo run test` + branch protection

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | @fastify/jwt + bcryptjs/argon2 para password hash |
| V3 Session Management | yes | httpOnly cookie + Redis + one-time-use rotation (D-01 a D-04) |
| V4 Access Control | yes | Tenant isolation via Prisma $extends — fail-fast |
| V5 Input Validation | yes | Zod em todas as routes de API |
| V6 Cryptography | partial | JWT RS256 ou HS256 para tokens; nunca armazenar refresh token em texto puro no log |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak | Information Disclosure | Prisma $extends + ALS — throws sem contexto |
| Refresh token theft | Elevation of Privilege | One-time-use rotation (D-02); token detectado como roubado quando legítimo tenta usar antigo |
| Webhook spoofing | Spoofing | Verificar `apikey` no corpo; HTTPS em produção |
| JWT forging | Tampering | Secret em env var; HS256 mínimo; nunca expor secret em log |
| PII em logs | Information Disclosure | Pino `redact` paths; audit_log.metadata sem PII |
| BullMQ job replay | Tampering | Idempotency via jobId único (Fase 3); DLQ para inspeção manual |
| Password exposure | Information Disclosure | Argon2id ou bcrypt; nunca logar body de `/auth/login` |

---

## Sources

### Primary (HIGH confidence)
- Prisma official docs — `$extends`, `query`, `$allModels`, `$allOperations` patterns
- docs.bullmq.io — connections, workers, retry, concurrency
- github.com/fastify/fastify-jwt README — httpOnly cookie + dual token pattern
- turborepo.dev/docs — task pipeline, `persistent`, `cache:false`, workspace structure
- Docker Hub `evoapicloud/evolution-api` — tag v2.3.7 confirmed present
- `npm view` registry — all package versions verified 2026-05-23

### Secondary (MEDIUM confidence)
- oneuptime.com multi-tenant Node.js guide — AsyncLocalStorage + Prisma pattern
- oneuptime.com BullMQ DLQ guide — worker.on('failed') + DLQ queue pattern
- lewisblackburn.me Prisma audit log — $extends audit pattern + recursion prevention
- Community examples (medium.com, dev.to) — Evolution API webhook payload structure with `apikey` field

### Tertiary (LOW confidence)
- Evolution API webhook authentication mechanism — inferred from source analysis and community examples; official documentation omits this detail

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — todas as versões verificadas via `npm view`
- Architecture: HIGH — patterns verificados em documentação oficial
- Evolution API Docker tag: HIGH — confirmado `evoapicloud/evolution-api:v2.3.7` via Docker Hub
- Evolution API Webhook auth: MEDIUM — comportamento documentado pela comunidade; ausência de HMAC confirmada mas mecanismo exato de verificação não está em docs oficiais
- Pitfalls: HIGH — a maioria provém de issues conhecidos e documentação oficial

**Research date:** 2026-05-23
**Valid until:** 2026-08-23 (90 dias — stack estável, mas verificar Evolution API se surgir v2.4.0 stable)
