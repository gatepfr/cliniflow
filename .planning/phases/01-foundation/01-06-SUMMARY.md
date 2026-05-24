---
phase: "01-foundation"
plan: "06"
subsystem: "api"
tags: ["fastify", "auth", "jwt", "redis", "webhook", "bullmq", "bcrypt"]
dependency_graph:
  requires: ["01-03", "01-04", "01-05"]
  provides: ["api-server", "auth-routes", "webhook-handler"]
  affects: ["01-07", "01-08", "01-09"]
tech_stack:
  added: ["bcryptjs", "ioredis", "bullmq", "fastify-plugin"]
  patterns: ["JWT refresh rotation", "httpOnly cookie", "Redis key-per-token", "async webhook enqueue"]
key_files:
  created:
    - apps/api/src/server.ts
    - apps/api/src/plugins/auth.ts
    - apps/api/src/plugins/tenant.ts
    - apps/api/src/plugins/logger.ts
    - apps/api/src/lib/redis.ts
    - apps/api/src/lib/password.ts
    - apps/api/src/routes/auth/signup.ts
    - apps/api/src/routes/auth/login.ts
    - apps/api/src/routes/auth/refresh.ts
    - apps/api/src/routes/auth/logout.ts
    - apps/api/src/routes/auth/router.ts
    - apps/api/src/routes/webhooks/evolution.ts
    - apps/api/src/routes/auth/index.ts
    - apps/api/src/routes/webhooks/index.ts
  modified:
    - apps/api/package.json
decisions:
  - "IORedis named import `{ Redis }` required for ESM CJS interop — default import has no construct signatures in strict TS"
  - "Pino Logger cast to `any` for Fastify constructor — bridge between pino.Logger and FastifyLoggerOptions types with exactOptionalPropertyTypes"
  - "Error handler typed as `unknown` per TS strict mode; AppError duck-typed via property checks"
metrics:
  duration: "289s"
  completed: "2026-05-24T17:33:01Z"
  tasks_completed: 2
  files_created: 14
---

# Phase 1 Plan 6: Fastify API Server — Auth, Tenant Middleware, Webhook Handler Summary

**One-liner:** Fastify server with JWT+Redis refresh token rotation, four auth routes, tenant context middleware, and async Evolution webhook handler with LGPD-compliant job enqueuing.

## What Was Built

### Task 1: Server Bootstrap, Plugins, Redis Client, Password Utilities (commit: 2b2e361)

- **`apps/api/src/server.ts`** — `buildApp()` factory and `startServer()` export. Registers CORS, authPlugin, tenantPlugin. Routes prefixed `/api/auth` and `/webhooks`. Global error handler without stack/SQL leakage.
- **`apps/api/src/plugins/auth.ts`** — `fp()`-wrapped plugin registering `@fastify/cookie` and `@fastify/jwt`. Decorates `app.authenticate` preHandler using `request.jwtVerify()`.
- **`apps/api/src/plugins/tenant.ts`** — `onRequest` hook that reads `request.user` (populated by jwtVerify) and attaches `request.tenantCtx = { tenantId, userId }`. Does NOT use `tenantStorage.run()` in the hook — avoids ALS propagation issue (RESEARCH.md Pitfall 2).
- **`apps/api/src/plugins/logger.ts`** — Pino logger with `redact.paths` covering authorization headers, cookies, phone, email, password, content fields. Serializer omits body/headers.
- **`apps/api/src/lib/redis.ts`** — `ioredis` `Redis` client with `lazyConnect: true`. Error events logged without PII.
- **`apps/api/src/lib/password.ts`** — `hashPassword`/`verifyPassword` using `bcryptjs` (pure JS, SALT_ROUNDS=12).

### Task 2: Auth Routes and Webhook Handler (commit: dd1e12f)

- **`signup.ts`** — Creates Tenant + User in `$transaction`. Issues access token (body) + refresh cookie. Redis `token:{jwt}` EX 2592000 (D-04).
- **`login.ts`** — Bcrypt compare even for missing users (constant-time, T-1-PLAN06-01). Same error message for both cases.
- **`refresh.ts`** — One-time rotation: `redis.get()` → validate → `redis.del()` → `redis.set(newToken)` (D-02). Issues new access + refresh tokens.
- **`logout.ts`** — `redis.del(token:${refreshToken})` before clearing cookie. Immediate invalidation (FOUND-05, D-05, T-1-PLAN06-02).
- **`evolution.ts`** — `verifyEvolutionWebhook()` apikey check. `void reply.code(200).send()` fire-and-forget. `extractWebhookJobData()` strips `body.data` for LGPD compliance (T-1-PLAN06-03). BullMQ `WEBHOOK_EVOLUTION` queue with 3 attempts + exponential backoff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IORedis ESM named import**
- **Found during:** Task 2 (TypeScript build)
- **Issue:** `import IORedis from 'ioredis'` → `no construct signatures` in strict TS ESM context
- **Fix:** Changed to `import { Redis } from 'ioredis'` and `new Redis(...)` in both `redis.ts` and `evolution.ts`
- **Files modified:** `apps/api/src/lib/redis.ts`, `apps/api/src/routes/webhooks/evolution.ts`

**2. [Rule 1 - Bug] Pino Logger type incompatibility with Fastify**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** `pino.Logger` not directly assignable to `FastifyLoggerOptions` with `exactOptionalPropertyTypes: true`
- **Fix:** Cast `logger as any` in `buildApp()` — documented with comment explaining safe usage
- **Files modified:** `apps/api/src/server.ts`

**3. [Rule 1 - Bug] Error handler typed as `Error` but receives `unknown` in strict mode**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** `error.name` and `error.statusCode` failed strict type check on `unknown`
- **Fix:** Duck-typed AppError via property check (`err.name === 'AppError' && err.statusCode != null && typeof err.toJSON === 'function'`)
- **Files modified:** `apps/api/src/server.ts`

**4. [Rule 1 - Bug] `@clinicaflow/db` types not found (build order)**
- **Found during:** Task 2 (TypeScript build)
- **Issue:** `packages/db` dist not built — Prisma client not generated
- **Fix:** Ran `prisma generate` then `pnpm --filter @clinicaflow/db build` before API build
- **Impact:** Plan 09 tests will need `DATABASE_URL` env and db build as prerequisite

## Known Stubs

None — all routes are fully wired. No placeholder data or TODO returns.

## Threat Flags

No new surface beyond the plan's threat model. All threats T-1-02, T-1-03, T-1-05, T-1-PLAN06-01 through T-1-PLAN06-03 have mitigations implemented as designed.

## Self-Check: PASSED

- `apps/api/src/server.ts` — exists, exports `buildApp` and `startServer`
- `apps/api/src/plugins/auth.ts` — exists, registers JWT + cookie, decorates `authenticate`
- `apps/api/src/plugins/tenant.ts` — exists, `request.tenantCtx` pattern
- `apps/api/src/plugins/logger.ts` — exists, `[REDACTED]` censor
- `apps/api/src/lib/redis.ts` — exists, named `Redis` import
- `apps/api/src/lib/password.ts` — exists, `bcryptjs` import
- `apps/api/src/routes/auth/signup.ts` through `logout.ts` — all exist
- `apps/api/src/routes/webhooks/evolution.ts` — exists
- Commits `2b2e361` and `dd1e12f` present in git log
- `pnpm --filter @clinicaflow/api build` exits 0
