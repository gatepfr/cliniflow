# Stack Research: ClínicaFlow

**Project:** ClínicaFlow — SaaS WhatsApp + IA para clínicas de saúde
**Researched:** 2026-05-23
**Method:** npm registry (exact versions verified), Context7 (library IDs resolved), training knowledge (flagged where applicable)

---

## 1. Runtime & Monorepo

**Recommendation:** Node.js 20 LTS + pnpm 9 + Turborepo 2
**Confidence:** High

Node.js 20 LTS is confirmed correct. It remains the active LTS line through April 2026; Node 22 goes LTS in October 2025 but isn't needed until a planned upgrade.

Use **pnpm** (not npm workspaces or yarn) for the monorepo. pnpm 9's workspace linking is significantly faster and its strict dependency isolation prevents phantom dependency bugs that bite multi-package repos. Use **Turborepo 2** (`turbo@2.9.14`) for task orchestration — it caches builds and test runs across the monorepo with zero configuration for simple pipelines.

```json
// package.json (root)
{
  "packageManager": "pnpm@9.x",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint"
  }
}
```

**Pitfalls:**
- Do NOT use npm workspaces — it lacks pnpm's strict linking and is slower at scale.
- Do NOT use Lerna — deprecated in favor of Turborepo for task scheduling.
- Node 20 requires explicit `--experimental-vm-modules` flag for Vitest with ESM; use CommonJS in workers until resolved.

---

## 2. Fastify (Backend Framework)

**Recommendation:** `fastify@5.8.5`
**Confidence:** High (npm-verified version)

Fastify 5 is the current major. It dropped support for Node.js < 18, aligns with the Node 20 LTS target, and brings improved TypeScript inference with `@fastify/type-provider-typebox` or `zod-to-json-schema`.

### Essential Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| `@fastify/cors` | 11.2.0 | CORS headers — configure allowed origins per environment |
| `@fastify/helmet` | 13.0.2 | Security headers (CSP, HSTS, X-Frame-Options) |
| `@fastify/rate-limit` | 10.3.0 | Route-level rate limiting, Redis-backed for multi-instance |
| `@fastify/swagger` | 9.7.0 | OpenAPI 3 schema generation from route definitions |
| `@fastify/swagger-ui` | 5.2.6 | Swagger UI endpoint (disable in production) |
| `@fastify/jwt` | 10.1.0 | JWT sign/verify, integrates with request decorators |
| `@fastify/cookie` | 11.0.2 | Cookie parsing/setting for httpOnly refresh tokens |
| `@fastify/multipart` | 10.0.0 | File uploads (for CSV import — up to 50k rows) |
| `@fastify/sensible` | 6.0.4 | HTTP error helpers (`reply.notFound()`, `reply.badRequest()`) |
| `fastify-plugin` | 5.1.0 | Required for plugin scoping |

### Multi-Tenant Middleware Pattern

Every API route must inject `tenant_id` from the JWT before reaching handler logic. Do this via a `onRequest` hook registered globally, not per-route.

```typescript
// apps/api/src/plugins/tenant.ts
import fp from 'fastify-plugin'

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    // @fastify/jwt decorates request.user after verify
    if (!request.routeOptions.url.startsWith('/webhooks/')) {
      await request.jwtVerify()
      if (!request.user?.tenantId) {
        return reply.code(401).send({ error: 'missing_tenant' })
      }
      // Attach to request context for downstream use
      request.tenantId = request.user.tenantId
    }
  })
})
```

Declare a module augmentation in TypeScript so `request.tenantId` is typed everywhere.

### Rate Limiting

`@fastify/rate-limit@10.3.0` supports Redis as a store natively. Use it for the WhatsApp webhook endpoint and public-facing auth routes:

```typescript
await fastify.register(rateLimit, {
  global: false, // apply only to decorated routes
  max: 100,
  timeWindow: '1 minute',
  redis: redisConnection, // reuse BullMQ connection
  keyGenerator: (request) => request.tenantId ?? request.ip,
})
```

For the campaign dispatch internal rate limit (30 msgs/min per WhatsApp number), implement this in the BullMQ rate limiter, NOT in Fastify — Fastify rate-limit is for API protection, not business throttling.

### Key Config/Patterns

```typescript
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    // Pino redact — NEVER log patient message content
    redact: ['req.body.content', 'req.body.message', '*.phone', '*.cpf'],
  },
  trustProxy: true, // Behind Hetzner load balancer / nginx
  ajv: {
    customOptions: {
      removeAdditional: true, // strip unknown fields from request
      coerceTypes: 'array',
      allErrors: false, // fail fast
    },
  },
})
```

### Pitfalls

- **Fastify 5 breaking change:** `request.params`, `request.body`, `request.query` are now typed via `RouteGenericInterface` — you must define explicit schema or use a type provider. Don't use `any` casts.
- **Plugin scope:** Plugins registered outside `fp()` wrapper are scoped to a sub-instance. Multi-tenant middleware must use `fp()` to be available globally.
- **Helmet CSP in dev:** Helmet blocks Swagger UI with a strict CSP. Use `helmet({ contentSecurityPolicy: false })` in development only.
- **Rate limit store:** Without Redis store, rate limits reset on each process restart and don't work across multiple instances. Always use Redis in staging and production.

---

## 3. Prisma + PostgreSQL

**Recommendation:** `prisma@7.8.0` + `@prisma/client@7.8.0` on PostgreSQL 16
**Confidence:** High (npm-verified; Prisma 7 is current latest with `prisma/prisma` dist-tag `latest: 7.8.0`)

**Important note on version:** Prisma 6.x is tagged `prev` (6.19.2). Prisma 7.8.0 is `latest`. Start with Prisma 7 — it has improved relation querying and stricter TypeScript inference. The migration from 5→6→7 has several breaking changes in query API; starting fresh avoids them.

### IDs: cuid2 over cuid

**Use `@paralleldrive/cuid2@3.3.0`, not the original `cuid@3.0.0`.**

- `cuid` (original) is deprecated and unmaintained by the author since 2022.
- `cuid2` is the intended successor: cryptographically stronger, still human-readable, still non-sequential (prevents enumeration attacks).
- Prisma 7 supports custom ID generators via `@default(dbgenerated(...))` or application-level generation before insert.

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Patient {
  id         String   @id @default(cuid())  // ← override in application layer
  tenantId   String
  // ...
  
  @@index([tenantId])
  @@index([tenantId, phone])
}
```

In practice, generate the cuid2 in application code and pass it as the `id` field rather than using Prisma's `@default(cuid())` which uses the older library:

```typescript
import { createId } from '@paralleldrive/cuid2'

await prisma.patient.create({
  data: {
    id: createId(),
    tenantId: ctx.tenantId,
    // ...
  }
})
```

### Row-Level Multi-Tenancy Pattern

Every model gets `tenantId String` and an index. The key discipline is a **typed Prisma client wrapper** that injects `tenantId` into every query automatically:

```typescript
// packages/db/src/tenant-client.ts
import { PrismaClient } from '@prisma/client'

export function createTenantClient(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Inject tenantId into where clauses
          if ('where' in args) {
            args.where = { ...args.where, tenantId }
          } else {
            (args as any).where = { tenantId }
          }
          const result = await query(args)
          return result
        },
      },
    },
  })
}
```

This is a Prisma Client Extension (stable since Prisma 5). It ensures no handler can forget the `tenantId` filter. Use the extended client throughout the app, never the raw `PrismaClient` directly in handlers.

**Do NOT use PostgreSQL Row-Level Security (Postgres RLS) as primary enforcement** for this project. Reasons:
1. Row-level multi-tenancy in Prisma with the extension above gives the same protection at the application level with better debuggability.
2. Postgres RLS requires setting session variables before each query (`SET app.tenant_id = X`), which is complex with connection pooling (PgBouncer/transaction mode).
3. The team already has operational experience with row-level in the CRM do Verê.

Postgres RLS can be added as a defense-in-depth layer later, but don't make it the primary isolation mechanism in MVP.

### Migrations in Production

- **Use `prisma migrate deploy`** (not `prisma migrate dev`) in CI/CD. `migrate dev` regenerates the client and is not safe in production.
- Run migrations before deploying new application code (not after).
- Name migrations meaningfully: `prisma migrate dev --name add_opt_in_at_to_patient`.
- Add migrations to the deployment pipeline: `prisma migrate deploy && node dist/server.js`.
- **Prisma Accelerate** (Prisma's connection pooling product) is not needed — use PgBouncer on Hetzner instead. It's free, runs on the same host, and avoids vendor lock-in.

### Connection Pooling

In production on Hetzner, run PgBouncer in transaction mode between the app and Postgres. This is critical because:
- Fastify will have multiple instances (horizontal scaling).
- BullMQ workers open their own connections.
- Without pooling, you'll hit Postgres `max_connections` under moderate load.

```
App instances → PgBouncer (transaction mode, port 6432) → PostgreSQL 16 (port 5432)
```

Configure Prisma `DATABASE_URL` to point to PgBouncer, add `?pgbouncer=true&connection_limit=1` to the connection string.

### Pitfalls

- **`$transaction` with PgBouncer in transaction mode:** Interactive transactions (the callback form: `prisma.$transaction(async (tx) => {...})`) work correctly in transaction mode because PgBouncer holds the connection for the duration. However, if you use statement-level pooling, they break. Stick to transaction mode.
- **Prisma 7 breaking change:** `findFirst` without `orderBy` is non-deterministic. Always specify `orderBy` or use `findUnique`. Prisma 7 added a lint warning for this.
- **Migrations on large tables:** Adding a non-nullable column without a default will lock the table. Always add with a default, backfill, then add constraint.
- **Soft deletes:** Prisma does not natively support soft delete in 7.x. Implement with a global middleware or extension that adds `WHERE deleted_at IS NULL` to all reads. Do this once, correctly, at setup.

```typescript
// Add to tenant-client.ts extension
async findMany({ args, query }) {
  args.where = { ...args.where, deletedAt: null }
  return query(args)
}
```

---

## 4. BullMQ (Job Queues)

**Recommendation:** `bullmq@5.77.1`
**Confidence:** High (npm-verified; BullMQ 5 is current with active releases — published 22 hours before research date)

BullMQ 5.x requires Redis >= 5.0.0 and Node >= 12.22.0. ioredis@5.10.1 is bundled as a dependency — do not install a separate ioredis version that conflicts.

### Queue Definitions

Five queues as defined in CLAUDE.md:

```typescript
// packages/queue/src/queues.ts
import { Queue, Worker, QueueEvents } from 'bullmq'
import { redisConnection } from './redis'

const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // starts at 2s, then 4s, 8s, 16s, 32s
  },
  removeOnComplete: { count: 100 }, // keep last 100 completed jobs
  removeOnFail: { count: 500 },     // keep last 500 failed for inspection
}

export const campaignDispatchQueue = new Queue('campaign-dispatch', {
  connection: redisConnection,
  defaultJobOptions,
})

export const aiConversationQueue = new Queue('ai-conversation', {
  connection: redisConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 3 }, // AI failure escalates faster
})

export const appointmentConfirmQueue = new Queue('appointment-confirm', {
  connection: redisConnection,
  defaultJobOptions,
})

export const recallSchedulerQueue = new Queue('recall-scheduler', {
  connection: redisConnection,
  defaultJobOptions,
})

export const webhookEvolutionQueue = new Queue('webhook-evolution', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 10, // webhooks are critical, retry harder
    backoff: { type: 'exponential', delay: 500 },
  },
})
```

### Exponential Backoff Configuration

BullMQ's exponential backoff formula: `delay * (2 ^ (attemptsMade - 1))`. With `delay: 2000`:
- Attempt 1 fail → wait 2s
- Attempt 2 fail → wait 4s
- Attempt 3 fail → wait 8s
- Attempt 4 fail → wait 16s
- Attempt 5 fail → wait 32s

Total max wait before giving up: ~62 seconds spread across retries. For non-urgent queues (recall-scheduler), use `delay: 10000` for gentler retries.

### Dead Letter Queue (DLQ)

BullMQ does not have a native DLQ concept. Implement it via the `failed` event on `QueueEvents`:

```typescript
// packages/queue/src/dlq.ts
import { QueueEvents } from 'bullmq'

const queueNames = [
  'campaign-dispatch',
  'ai-conversation',
  'appointment-confirm',
  'recall-scheduler',
  'webhook-evolution',
]

export function setupDLQ(redisConnection: object) {
  for (const name of queueNames) {
    const events = new QueueEvents(name, { connection: redisConnection })
    
    events.on('failed', async ({ jobId, failedReason }) => {
      const job = await queue.getJob(jobId)
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        // Job exhausted all retries — send to DLQ
        await dlqQueue.add('failed-job', {
          originalQueue: name,
          jobId,
          data: job.data,
          reason: failedReason,
          failedAt: new Date().toISOString(),
        })
      }
    })
  }
}
```

Store the `dlq` queue separately, monitored via Bull Board or a custom admin endpoint.

### Rate Limiting per WhatsApp Number

For `campaign-dispatch`, enforce the 30 msgs/min per number limit using BullMQ's built-in rate limiter:

```typescript
const campaignWorker = new Worker(
  'campaign-dispatch',
  campaignDispatchProcessor,
  {
    connection: redisConnection,
    concurrency: 5, // 5 concurrent workers max
    limiter: {
      max: 30,         // 30 jobs
      duration: 60000, // per 60 seconds
      groupKey: 'whatsappNumber', // rate limit per number, not globally
    },
  }
)
```

The `groupKey` tells BullMQ to look at `job.data.whatsappNumber` and apply the rate limit per unique number. This maps directly to the "30 msgs/min per número" constraint.

### Concurrency Strategy

| Queue | Concurrency | Reasoning |
|-------|-------------|-----------|
| `campaign-dispatch` | 5 | Rate-limited; 5 × 30/min × number count = throughput |
| `ai-conversation` | 10 | I/O bound (Claude API calls); higher OK |
| `appointment-confirm` | 3 | Low volume; conservative |
| `recall-scheduler` | 1 | Runs daily; serial is fine, prevents duplicate scheduling |
| `webhook-evolution` | 20 | Must be fast; webhooks are time-sensitive |

### Pitfalls

- **ioredis connection:** Do NOT create a separate ioredis connection for BullMQ. Pass a shared `IORedis` connection instance. Creating per-queue connections exhausts Redis connection limits.
- **Job data size:** BullMQ serializes job data to Redis via MessagePack (msgpackr). Keep job payloads small — pass `patientId` and `tenantId`, not the full patient object. Fetch from DB inside the worker.
- **Worker crashes:** If a worker crashes mid-job, BullMQ's lock mechanism will re-queue it after the lock expires (default 30s). Do NOT make worker jobs non-idempotent. Campaign dispatch must check if message was already sent before re-sending.
- **Failed jobs visibility:** Use Bull Board (`@bull-board/fastify@6.x`) in an admin-only route for visibility into queues. Minimum viable observability for the MVP.

```typescript
npm install @bull-board/fastify @bull-board/api
```

---

## 5. Evolution API (WhatsApp)

**Recommendation:** Self-hosted Docker container (EvolutionAPI/evolution-api on GitHub), no npm package
**Confidence:** Medium (based on project team's prior experience + npm unpublish confirmed; training knowledge for API patterns)

Evolution API is deployed as a standalone Docker container, not a Node.js library. The `evolution-api` npm package was unpublished in December 2023. Integration is via HTTP REST calls to the Evolution API container.

### Wrapper Pattern

Build a typed HTTP client wrapper in `packages/whatsapp/`:

```typescript
// packages/whatsapp/src/client.ts
import { z } from 'zod'

const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

export class EvolutionClient {
  private headers: Record<string, string>

  constructor(private instanceName: string) {
    this.headers = {
      'apikey': EVOLUTION_API_KEY!,
      'Content-Type': 'application/json',
    }
  }

  async sendText(phone: string, message: string) {
    const response = await fetch(
      `${EVOLUTION_BASE_URL}/message/sendText/${this.instanceName}`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          number: phone,          // E.164 format: +5543991234567
          text: message,
          delay: Math.floor(Math.random() * 10000) + 5000, // 5-15s random delay
        }),
      }
    )
    if (!response.ok) {
      throw new Error(`Evolution API error: ${response.status}`)
    }
    return response.json()
  }
}
```

Use native `fetch` (Node.js 20 built-in) — no need for axios in this wrapper.

### Instance Pool Management

For Starter plan (shared pool), maintain a mapping of `tenantId → instanceName` in the database. Route all sends through the instance assigned to that tenant.

```typescript
// packages/whatsapp/src/pool.ts
export async function getInstanceForTenant(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { whatsappInstance: true, plan: true },
  })
  if (!tenant?.whatsappInstance) {
    throw new AppError('NO_WHATSAPP_INSTANCE', 'No WhatsApp instance assigned', 503)
  }
  return tenant.whatsappInstance
}
```

### Webhook Handler

```typescript
// apps/api/src/routes/webhooks/evolution.ts
// POST /webhooks/evolution/:tenantId

fastify.post('/webhooks/evolution/:tenantId', {
  config: { rateLimit: { max: 500, timeWindow: '1 minute' } }, // allow high volume
}, async (request, reply) => {
  // 1. Verify signature
  const sig = request.headers['x-evolution-signature']
  if (!verifyEvolutionSignature(sig, request.rawBody)) {
    return reply.code(401).send()
  }

  // 2. Return 200 IMMEDIATELY — process async
  reply.code(200).send({ ok: true })

  // 3. Enqueue for processing (fire and forget — errors logged separately)
  await webhookEvolutionQueue.add('process', {
    tenantId: request.params.tenantId,
    payload: request.body,
    receivedAt: new Date().toISOString(),
  })
})
```

To access `request.rawBody` for signature verification, configure Fastify's `addContentTypeParser` before registering routes.

### Rate Limiting for Dispatch

Enforce in the BullMQ worker (see Section 4), not in Evolution API calls. The daily limit (1000 msgs/day per number) requires a Redis counter:

```typescript
async function checkDailyLimit(instanceName: string): Promise<void> {
  const key = `daily:${instanceName}:${new Date().toISOString().slice(0, 10)}`
  const count = await redis.incr(key)
  await redis.expire(key, 86400) // 1 day TTL
  if (count > 1000) {
    throw new AppError('DAILY_LIMIT_REACHED', 'WhatsApp daily limit reached', 429)
  }
}
```

### Dispatch Window Enforcement

Check before adding to queue, not inside the worker:

```typescript
import { isWithinInterval, parseISO, getDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz' // npm: date-fns-tz@3.x

function canDispatchNow(tenantTimezone: string): boolean {
  const now = toZonedTime(new Date(), tenantTimezone)
  const hour = now.getHours()
  const dayOfWeek = getDay(now) // 0 = Sunday
  
  if (dayOfWeek === 0) return false       // No Sunday
  if (hour < 9 || hour >= 20) return false // 9h-20h only
  // TODO: check Brazilian national holidays (hardcoded list or holiday API)
  return true
}
```

**Use `date-fns@4.x` + `date-fns-tz@3.x`** for date manipulation. Do NOT use `moment.js` (deprecated/large). Do NOT use raw `toLocaleString()` for timezone math — it's inconsistent across environments.

### Pitfalls

- **Message variation is mandatory:** Identical messages in mass campaigns trigger WhatsApp anti-spam detection. The IA rewrite (via Claude Haiku) must produce genuinely different text per message — not just `{name}` substitution.
- **Number warming:** New WhatsApp numbers must warm up over 7 days before high-volume campaigns. Build a warming scheduler that starts at 10 msgs/day, increases 10/day each day up to the limit. Skipping this = ban.
- **Webhook idempotency:** Evolution API may deliver the same webhook twice. Add `messageId` deduplication in the webhook queue processor using Redis `SETNX`.
- **Connection status monitoring:** Poll `GET /instance/connectionState/{instanceName}` every 5 minutes. If disconnected, alert the tenant immediately (email/in-app). A disconnected instance silently drops all messages.

---

## 6. JWT + Refresh Token (Auth)

**Recommendation:** `@fastify/jwt@10.1.0` + `@fastify/cookie@11.0.2`
**Confidence:** High

### Token Architecture

```
Access Token:  15 min TTL, signed with RS256 (asymmetric), contains { userId, tenantId, role }
Refresh Token: 7 days TTL, stored httpOnly Secure SameSite=Strict cookie
```

Use **RS256** (asymmetric RSA) not HS256 (symmetric HMAC). Reasons:
- Multiple services (API + worker API) can verify tokens using the public key without sharing the secret.
- If a private key leaks, rotate it; old tokens signed with the old key stop working immediately.
- Industry standard for multi-service architectures.

Generate a key pair at deploy time and store as environment variables (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`).

### Fastify Setup

```typescript
// apps/api/src/plugins/auth.ts
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'

export default fp(async (fastify) => {
  await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET, // for signed cookies
  })

  await fastify.register(jwt, {
    secret: {
      private: process.env.JWT_PRIVATE_KEY!,  // for signing
      public: process.env.JWT_PUBLIC_KEY!,    // for verifying
    },
    sign: {
      algorithm: 'RS256',
      expiresIn: '15m',
    },
    cookie: {
      cookieName: 'refreshToken',
      signed: false, // JWT is self-signed; cookie signed separately
    },
  })
})
```

### Refresh Token Rotation

Store refresh tokens in the database (table: `refresh_tokens`) with columns: `id`, `userId`, `tenantId`, `tokenHash` (SHA-256 of token), `expiresAt`, `revokedAt`. This enables:
- Invalidation of all sessions on password change.
- Single-use refresh token rotation (revoke old, issue new on each refresh).
- Audit trail of active sessions.

```typescript
// Refresh endpoint
fastify.post('/auth/refresh', async (request, reply) => {
  const refreshToken = request.cookies.refreshToken
  if (!refreshToken) return reply.code(401).send()

  const tokenHash = sha256(refreshToken)
  const stored = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  })

  if (!stored) return reply.code(401).send({ error: 'invalid_refresh_token' })

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })

  const newRefreshToken = crypto.randomBytes(32).toString('hex')
  await prisma.refreshToken.create({
    data: {
      id: createId(),
      userId: stored.userId,
      tenantId: stored.tenantId,
      tokenHash: sha256(newRefreshToken),
      expiresAt: addDays(new Date(), 7),
    },
  })

  const accessToken = fastify.jwt.sign({
    userId: stored.userId,
    tenantId: stored.tenantId,
    role: stored.user.role,
  })

  return reply
    .setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',       // restrict cookie scope to /auth routes
      maxAge: 7 * 24 * 3600,
    })
    .send({ accessToken })
})
```

### Pitfalls

- **SameSite=Strict with cross-origin frontend:** If the frontend (`clinicaflow.com.br`) and API (`api.clinicaflow.com.br`) are on different subdomains, `SameSite=Strict` blocks the cookie on first navigation. Use `SameSite=Lax` or set both on the same domain behind a reverse proxy.
- **Token in localStorage:** Never store the access token in localStorage on the frontend. Store only in memory (React state/context). The httpOnly refresh cookie does the persistence. If the user reloads, the in-memory access token is gone — call `/auth/refresh` on app load to get a new one.
- **Role escalation:** Include `role` in the access token payload, but re-verify from DB on sensitive operations (e.g., billing changes). Tokens have 15-min lifetime; a demoted admin still holds a valid token.
- **Webhook routes bypass auth:** The `/webhooks/evolution/:tenantId` route must be excluded from JWT middleware but must still verify the Evolution API signature.

---

## 7. Zod (Validation)

**Recommendation:** `zod@4.4.3`
**Confidence:** High (npm-verified)

Zod 4 is current. Use it for all input validation on API routes (request body, query params, path params) and for all inter-package data contracts (job payloads, AI response schemas).

**Integration with Fastify:** Use `fastify-type-provider-zod` to connect Zod schemas directly to Fastify's JSON Schema validator, getting automatic serialization and type inference:

```typescript
npm install fastify-type-provider-zod
```

```typescript
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)
```

This means route handler input is fully typed without manual casting:

```typescript
const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  segmentFilter: z.object({
    inactiveSince: z.number().positive().optional(), // days
    tags: z.array(z.string()).optional(),
  }),
})

fastify.post('/campaigns', {
  schema: { body: createCampaignSchema },
}, async (request) => {
  // request.body is fully typed as z.infer<typeof createCampaignSchema>
  const { name, segmentFilter } = request.body
})
```

---

## 8. AI Integration (Anthropic Claude)

**Recommendation:** `@anthropic-ai/sdk@0.98.0`
**Confidence:** High (npm-verified; actively maintained with 168 versions published)

### Model Selection

```typescript
// packages/ai/src/client.ts
export const AI_MODELS = {
  TRIAGE: 'claude-haiku-4-5',    // fast, cheap — first message classification
  CONVERSATION: 'claude-sonnet-4-6', // quality — ongoing conversation
  REWRITE: 'claude-haiku-4-5',   // bulk campaign message rewriting
} as const
```

### Streaming

Use streaming for the AI conversation responses to reduce perceived latency. The first token arrives in ~300ms vs 2-3s for a full response:

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function streamConversationResponse(
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
) {
  const stream = await client.messages.stream({
    model: AI_MODELS.CONVERSATION,
    max_tokens: 500,    // WhatsApp messages must be concise
    system: systemPrompt,
    messages,
  })
  return stream
}
```

For BullMQ workers (non-streaming), use `client.messages.create()` directly.

### Cost Control

- Cache FAQ responses in Redis with a 24h TTL. If the patient message matches a known FAQ pattern (cosine similarity or keyword match), return cached response without calling Claude.
- Haiku for the first turn of every conversation (classify intent). Only call Sonnet if intent is "wants to schedule" or "complex question".
- Hard limit: 8 turns per conversation before transferring to human.
- Idle detection: if conversation has no messages for 24h, mark as `closed` automatically.

### Guardrail Validation

After every AI response, before sending to patient:

```typescript
// packages/ai/src/guardrails.ts
const FORBIDDEN_PATTERNS = [
  /diagnos/i,
  /prescriv/i,
  /trate com/i,
  /recomendo o medicamento/i,
  /pode ser/i,   // too close to diagnostic speculation
  /sintoma indica/i,
]

export function validateAIResponse(content: string): {
  safe: boolean
  reason?: string
} {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      return { safe: false, reason: `Forbidden pattern: ${pattern}` }
    }
  }
  return { safe: true }
}
```

If `safe: false`, do NOT send the message. Escalate to human, log to Sentry (without PII — log only the pattern that triggered, not the full message).

---

## 9. React Frontend

**Recommendation:** `react@19.2.6` + `vite@8.0.14` + `tailwindcss@4.3.0` + `shadcn@4.8.0`
**Confidence:** High for versions (npm-verified); Medium for shadcn integration patterns (evolving rapidly)

**Note:** React 19 (19.2.6) is now the latest stable. React 18 is still supported but start with 19 — it introduces `use()` hook, Server Components foundation (unused here), and improved Suspense.

### State Management

Do NOT use Redux. Use:
- `@tanstack/react-query@5.100.14` for all server state (campaigns, patients, conversations).
- React Context for auth state (current user, tenant).
- `zustand` for complex local UI state if needed (avoid `useState` prop drilling beyond 2 levels).

```typescript
// apps/web/src/queries/campaigns.ts
import { useQuery, useMutation } from '@tanstack/react-query'

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
    staleTime: 30_000,
  })
}
```

### Forms

Use `react-hook-form@7.76.1` + Zod resolver for all forms. Pair with shadcn/ui's `Form` component:

```typescript
npm install react-hook-form @hookform/resolvers
```

### Charts (ROI Dashboard)

Use `recharts@3.x` for the ROI dashboard charts. It's React-native, lightweight, and has good TypeScript support. Avoid Chart.js (requires canvas ref wrangling) and D3 (too low-level for this use case).

**Note:** npm shows `recharts@2.15.x` as stable; verify `recharts@3.x` release status before assuming it's available. Recharts 2.x is confirmed stable.

### shadcn/ui Component Recommendations

shadcn/ui (v4.8.0 CLI) is a copy-paste component library — install components individually, not as a dependency. Key components for ClínicaFlow:

| Component | Use Case |
|-----------|---------|
| `DataTable` | Patient list, campaign list |
| `Card` | Dashboard metric cards |
| `Dialog` | Campaign editor, import wizard |
| `Form` | All form layouts |
| `Badge` | Patient segment tags |
| `Progress` | Campaign dispatch progress |
| `Skeleton` | Loading states |
| `Sonner` | Toast notifications (replaces `@shadcn/toast`) |
| `Command` | Global search |
| `DatePicker` | Campaign scheduling |

### Pitfalls

- **React 19 + shadcn/ui compatibility:** shadcn/ui components are based on Radix UI primitives. As of May 2026, most Radix components are compatible with React 19, but verify specific components at install time. The shadcn CLI handles this.
- **Tailwind v4 changes:** Tailwind 4.0 dropped the `tailwind.config.js` config file in favor of CSS-first configuration. This is a significant breaking change from Tailwind 3. If copying any config from the CRM do Verê, update the config format.
- **No SSR needed:** Vite SPA is correct here. The dashboard is behind auth; SEO is irrelevant. Do NOT add Next.js — it's overengineering for this use case.

---

## 10. Pagar.me (Payments)

**Recommendation:** `pagarme@4.35.2` (REST wrapper) + direct REST API calls for subscription management
**Confidence:** Medium (version npm-verified; Pix recorrente support confirmed by description; API behavior based on training knowledge — verify specific endpoints before implementation)

### Current State of the SDK

The `pagarme` npm package (v4.35.2, maintained by Pagar.me/Stone team) is an MIT-licensed wrapper for the Pagar.me v5 REST API. It has no external dependencies. Version 4.x is the current stable; there is no `@pagarme/pagarme-js` (404 confirmed).

**However:** Pagar.me's v5 API is modern enough that direct `fetch` calls to the REST API may be cleaner than using the SDK, especially for subscription/recurrence endpoints that may not be fully covered by the SDK. Evaluate both and prefer the SDK for standard card/Pix charges, direct REST for subscription management.

### Setup

```typescript
// packages/billing/src/client.ts
import pagarme from 'pagarme'

let client: Awaited<ReturnType<typeof pagarme.client.connect>>

export async function getPagarmeClient() {
  if (!client) {
    client = await pagarme.client.connect({
      api_key: process.env.PAGARME_API_KEY!,
    })
  }
  return client
}
```

### Pix Recorrente

Pagar.me v5 supports subscription-based Pix billing. The implementation creates a `Subscription` with `payment_method: 'boleto'` or `'pix'`, then generates a new Pix QR code on each billing cycle. True recurring Pix (auto-debit) is not supported by the Brazilian financial system — each cycle generates a new QR code that the customer pays.

For ClínicaFlow's business model, the practical flow is:
1. Tenant signs up → Pagar.me creates a subscription.
2. On billing day → Pagar.me generates a Pix QR code and sends email (via Pagar.me's built-in notification) or ClínicaFlow sends via email (Resend).
3. Customer pays → Pagar.me webhook fires `subscription.charged`.
4. ClínicaFlow marks tenant as active for another month.

### Webhooks

```typescript
// apps/api/src/routes/webhooks/pagarme.ts
fastify.post('/webhooks/pagarme', async (request, reply) => {
  // Verify Pagar.me webhook signature
  const signature = request.headers['x-hub-signature'] as string
  if (!verifyPagarmeSignature(signature, request.rawBody, process.env.PAGARME_WEBHOOK_SECRET!)) {
    return reply.code(401).send()
  }

  reply.code(200).send() // Respond immediately

  const { type, data } = request.body as PagarmeWebhookPayload

  switch (type) {
    case 'subscription.charged':
      await activateTenantSubscription(data.subscription.metadata.tenantId)
      break
    case 'subscription.canceled':
      await deactivateTenant(data.subscription.metadata.tenantId)
      break
    case 'charge.paid':
      await recordPayment(data)
      break
  }
})
```

### Pitfalls

- **SDK v4 vs API v5:** The `pagarme@4.x` SDK wraps the v5 API but may lag behind new API features. Test subscription recurrence endpoints against the actual Pagar.me v5 sandbox before committing to the SDK.
- **Pix is not truly recurring:** Customers must pay each month's Pix manually. Design the UX to make this clear (and offer credit card as the "set it and forget it" option).
- **CNPJ/CPF validation:** Pagar.me requires valid Brazilian tax IDs for transactions. Add CPF/CNPJ validation (`@fnando/cpf`, `@fnando/cnpj` npm packages) before sending to Pagar.me to avoid API errors.
- **Sandbox vs production keys:** Pagar.me uses different API key prefixes for test (`pk_test_...`) vs production (`pk_live_...`). Never use production keys in development.

---

## 11. Observability

**Recommendation:** Pino (via Fastify) + `@sentry/node@10.53.1`
**Confidence:** High

Fastify uses **Pino** natively as its logger (no additional install needed). Pino 10.3.1 is the current version. Configure it with redaction for LGPD compliance:

```typescript
const logger = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.body.content',     // never log message content
      'req.body.phone',       // PII
      'req.body.cpf',         // PII
      '*.patient.fullName',   // PII
      '*.message',            // message content (may contain clinical info)
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url,
        tenantId: request.tenantId,     // OK — internal ID, not PII
        // NO: body, headers with auth tokens
      }
    },
  },
}
```

**Sentry** (`@sentry/node@10.53.1`): Note that Sentry 10.x uses OpenTelemetry for performance instrumentation and includes `@prisma/instrumentation@7.6.0` as a dependency — it auto-instruments Prisma queries. This is convenient but check that Sentry's Prisma instrumentation doesn't log query results (which could contain PII). Configure Sentry's `beforeSend` to strip PII from error events.

---

## 12. CSV Import (Patient Data)

**Recommendation:** `csv-parse@6.2.1`
**Confidence:** High

For the CSV wizard (up to 50k rows in <2 min), stream-parse the uploaded file — do NOT load it all into memory.

```typescript
import { parse } from 'csv-parse'
import { pipeline } from 'stream/promises'

async function importPatients(fileStream: Readable, tenantId: string) {
  const parser = parse({
    columns: true,     // use first row as headers
    skip_empty_lines: true,
    trim: true,
    bom: true,         // handle Excel BOM character
    relax_column_count: true, // don't crash on malformed rows
  })

  const batchSize = 500
  let batch: PatientImportRow[] = []

  for await (const record of fileStream.pipe(parser)) {
    batch.push(record)
    if (batch.length >= batchSize) {
      await processBatch(batch, tenantId)
      batch = []
    }
  }
  if (batch.length > 0) {
    await processBatch(batch, tenantId)
  }
}
```

Use `prisma.patient.createMany({ skipDuplicates: true })` with the normalized phone as the uniqueness key.

---

## 13. Monorepo Package Structure (Recommended)

```
/apps
  /api          → Fastify server, routes, controllers
  /web          → React + Vite frontend
  /worker       → BullMQ worker processes (separate from API for independent scaling)
/packages
  /db           → Prisma schema, migrations, tenant-client wrapper
  /shared       → Zod schemas, TypeScript types shared across apps
  /ai           → Claude client, prompts, guardrails
  /whatsapp     → Evolution API HTTP wrapper, pool management
  /billing      → Pagar.me wrapper
  /queue        → BullMQ queue definitions, DLQ setup
  /config       → Shared ESLint, Prettier, TypeScript config
```

The `worker` app should be a **separate process** from `api`. This allows independent scaling (more workers during campaign dispatch periods) and prevents a worker crash from taking down the API.

---

## Summary Table

| Layer | Package | Version | Confidence |
|-------|---------|---------|-----------|
| Runtime | Node.js | 20 LTS | High |
| Package Manager | pnpm | 9.x (11.2.2 latest) | High |
| Monorepo | Turborepo | 2.9.14 | High |
| Backend framework | fastify | 5.8.5 | High |
| CORS | @fastify/cors | 11.2.0 | High |
| Security headers | @fastify/helmet | 13.0.2 | High |
| Rate limiting (API) | @fastify/rate-limit | 10.3.0 | High |
| OpenAPI | @fastify/swagger + @fastify/swagger-ui | 9.7.0 + 5.2.6 | High |
| JWT | @fastify/jwt | 10.1.0 | High |
| Cookies | @fastify/cookie | 11.0.2 | High |
| File upload | @fastify/multipart | 10.0.0 | High |
| HTTP helpers | @fastify/sensible | 6.0.4 | High |
| Plugin utility | fastify-plugin | 5.1.0 | High |
| ORM | prisma + @prisma/client | 7.8.0 | High |
| ID generation | @paralleldrive/cuid2 | 3.3.0 | High |
| Job queues | bullmq | 5.77.1 | High |
| Redis client | ioredis (bundled in bullmq) | 5.10.1 | High |
| WhatsApp | Evolution API (Docker) | latest stable | Medium |
| HTTP client (internal) | Node.js built-in fetch | — (Node 20) | High |
| AI SDK | @anthropic-ai/sdk | 0.98.0 | High |
| Payments | pagarme | 4.35.2 | Medium |
| Validation | zod | 4.4.3 | High |
| Fastify+Zod bridge | fastify-type-provider-zod | latest | Medium |
| Frontend framework | react | 19.2.6 | High |
| Build tool | vite | 8.0.14 | High |
| CSS | tailwindcss | 4.3.0 | High |
| UI components | shadcn (CLI) | 4.8.0 | Medium |
| Server state | @tanstack/react-query | 5.100.14 | High |
| Forms | react-hook-form | 7.76.1 | High |
| Charts | recharts | 2.15.x | High |
| Logging | pino (bundled in fastify) | 10.3.1 | High |
| Error tracking | @sentry/node | 10.53.1 | High |
| Date handling | date-fns + date-fns-tz | 4.x + 3.x | High |
| CSV parsing | csv-parse | 6.2.1 | High |
| Email | resend | 6.12.3 | High |
| TypeScript | typescript | 5.x (6.0.3 latest) | High |
| Test runner | vitest | 4.1.7 | High |

---

## Packages to Explicitly Avoid

| Package | Reason |
|---------|--------|
| `express` | Fastify is already decided; Express is slower and less type-safe |
| `typeorm` | CLAUDE.md explicitly forbids it |
| `mongoose` / MongoDB drivers | Not for patient data |
| `moment.js` | Deprecated; use date-fns |
| `axios` | Use Node.js 20 built-in fetch; axios adds 50KB for nothing |
| `lodash` | Use native JS; lodash is unnecessary in modern Node/TS |
| `jsonwebtoken` directly | Use @fastify/jwt which wraps it with Fastify integration |
| `cuid` (original) | Deprecated; use @paralleldrive/cuid2 |
| `uuid` (v4) | cuid2 is preferred per project decisions |
| `redux` / `@reduxjs/toolkit` | TanStack Query + React Context is sufficient |
| `next.js` | Overengineering; Vite SPA is correct |
| `drizzle-orm` | Prisma is decided; Drizzle is an option but adds migration complexity |
| Prisma 5.x or 6.x | Start with Prisma 7 (current latest) to avoid future migration pain |

---

## Installation Reference

```bash
# Backend (apps/api + apps/worker)
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit \
  @fastify/swagger @fastify/swagger-ui @fastify/jwt @fastify/cookie \
  @fastify/multipart @fastify/sensible fastify-plugin \
  fastify-type-provider-zod

# Database
pnpm add prisma @prisma/client @paralleldrive/cuid2

# Queues
pnpm add bullmq

# AI
pnpm add @anthropic-ai/sdk

# Validation
pnpm add zod

# Payments
pnpm add pagarme

# Observability
pnpm add @sentry/node pino-pretty

# Date handling
pnpm add date-fns date-fns-tz

# CSV
pnpm add csv-parse

# Email
pnpm add resend

# Dev tools
pnpm add -D prisma typescript tsx tsup vitest turbo \
  @types/node eslint prettier

# Frontend (apps/web)
pnpm add react react-dom @tanstack/react-query \
  react-hook-form @hookform/resolvers \
  recharts

pnpm add -D vite @vitejs/plugin-react tailwindcss \
  typescript @types/react @types/react-dom vitest
```
