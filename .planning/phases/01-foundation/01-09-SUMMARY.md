---
phase: 01-foundation
plan: 09
subsystem: testing
tags: [vitest, prisma, fastify, bullmq, ioredis, lgpd, multi-tenant, whatsapp]

requires:
  - phase: 01-02
    provides: tenantStorage, getTenantContext, prisma (extended client), baseClient
  - phase: 01-06
    provides: buildApp (Fastify server with auth routes)
  - phase: 01-07
    provides: verifyEvolutionWebhook, extractWebhookJobData
  - phase: 01-08
    provides: BullMQ worker with 5 queues, QUEUE_NAMES constant

provides:
  - Tenant isolation regression guard — Test A (no-ctx throws [SECURITY]), Test B (cross-tenant returns 0 records)
  - LGPD audit log compliance guard — Test C (metadata has no PII fields)
  - Auth integration tests — signup 201+httpOnly cookie, login 200, logout Redis null, refresh-after-logout 401
  - Worker queue smoke tests — all 5 named queues enqueue and process jobs
  - Webhook unit tests — verifyEvolutionWebhook apikey matching (7 edge cases)

affects:
  - Phase 2 (data, configuration) — tenant isolation guarantee must hold across new models
  - CI pipeline (Plan 01-10) — these test suites are the gate for GitHub Actions

tech-stack:
  added:
    - "@prisma/adapter-pg 6.x — Prisma 7 WASM engine driver adapter for Node.js"
    - "pg — PostgreSQL native driver (required by @prisma/adapter-pg)"
    - "@types/pg — TypeScript types for pg"
  patterns:
    - "Vitest 4 config: pool forks + singleFork=true for DB tests (ALS isolation between test runs)"
    - "Test cleanup: cascade delete in dependency order (auditLog → patient → user → tenant)"
    - "buildApp() accepts optional { logger: false } for silent test output"
    - "Worker tests use Redis DB 15 (flushdb in afterAll) — never pollutes dev data"

key-files:
  created:
    - packages/db/vitest.config.ts
    - packages/db/src/__tests__/setup.ts
    - packages/db/src/__tests__/tenant-isolation.test.ts
    - packages/db/src/__tests__/audit-log.test.ts
    - apps/api/vitest.config.ts
    - apps/api/src/__tests__/setup.ts
    - apps/api/src/__tests__/auth.test.ts
    - apps/worker/vitest.config.ts
    - apps/worker/src/__tests__/queues.test.ts
    - packages/whatsapp/vitest.config.ts
    - packages/whatsapp/src/__tests__/webhook.test.ts
  modified:
    - packages/db/src/client.ts (adapter + bug fix for create where-injection)
    - packages/db/package.json (added @prisma/adapter-pg + pg)
    - packages/db/tsconfig.json (exclude __tests__ from build)
    - apps/api/src/server.ts (buildApp accepts logger option)
    - apps/api/tsconfig.json (exclude __tests__ from build)
    - apps/worker/tsconfig.json (exclude __tests__ from build)

key-decisions:
  - "Prisma 7 WASM engine requires @prisma/adapter-pg — binary engine removed; createAdapter() wraps pg Pool with DATABASE_URL"
  - "Vitest 4 removed poolOptions — use top-level singleFork: true instead"
  - "buildApp({ logger: false }) pattern — test-friendly option avoids pino logger Fastify incompatibility in test env"
  - "Test cleanup uses tenant-scoped cascade delete (auditLog → patient → user → tenant) to respect FK constraints"
  - "Worker tests use Redis DB 15 (isolated from dev DB 0) with flushdb in afterAll"

patterns-established:
  - "Pattern: Test infrastructure uses real DB (no mocking) — tests as LGPD compliance proof"
  - "Pattern: afterAll cleanup identifies test records by email domain (@test.clinicaflow, @apitest.clinicaflow)"

requirements-completed: [FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06]

duration: 50min
completed: 2026-05-24
---

# Phase 1 Plan 09: Test Infrastructure Summary

**Vitest test suites for tenant isolation (LGPD), audit log PII compliance, auth session lifecycle, BullMQ queue smoke, and Evolution API webhook verification — 32 tests, all green**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-24T17:42:31Z
- **Completed:** 2026-05-24T18:32:00Z
- **Tasks:** 2
- **Files created:** 11, **Files modified:** 6

## Accomplishments

- Tenant isolation proven: Test A throws `[SECURITY] Tenant context required` before any DB query; Test B shows TenantB context returns 0 records from TenantA data
- LGPD audit log proven: every `patient.create()` generates an `audit_log` row with empty `metadata` (no `full_name`, `phone_normalized`, `birth_date`, etc.)
- Auth integration tests: signup returns 201 + httpOnly `refreshToken` cookie; logout deletes Redis key (verified `toBeNull`); subsequent `/refresh` returns 401
- All 5 BullMQ queues verified: `campaign-dispatch`, `ai-conversation`, `appointment-confirm`, `recall-scheduler`, `webhook-evolution` each enqueue and process a job
- Webhook unit tests: 7 edge cases covering valid key, wrong key, missing key, empty body, null, empty string, type guard narrowing

## Task Commits

1. **Task 1: DB test infrastructure + tenant isolation + audit log** — `fb30f54` (test)
2. **Task 2: API auth, worker queues, webhook tests** — `f653852` (test)
3. **Plan metadata:** (docs commit below)

## Files Created/Modified

- `packages/db/vitest.config.ts` — Vitest 4 config, forks pool, singleFork
- `packages/db/src/__tests__/setup.ts` — beforeAll $connect, afterAll cascade cleanup by tenant IDs
- `packages/db/src/__tests__/tenant-isolation.test.ts` — 4 tests: Tests A (2 variants) + Test B (2 variants)
- `packages/db/src/__tests__/audit-log.test.ts` — 3 tests: audit row created, no PII in metadata, required fields
- `apps/api/vitest.config.ts` — Vitest 4 config for API integration tests
- `apps/api/src/__tests__/setup.ts` — DB + Redis connect/disconnect, cascade cleanup
- `apps/api/src/__tests__/auth.test.ts` — 6 integration tests via `app.inject()` (no supertest)
- `apps/worker/vitest.config.ts` — Vitest 4 config for queue smoke tests
- `apps/worker/src/__tests__/queues.test.ts` — `it.each` over 5 QUEUE_NAMES, Redis DB 15
- `packages/whatsapp/vitest.config.ts` — Vitest 4 config for unit tests
- `packages/whatsapp/src/__tests__/webhook.test.ts` — 7 unit tests for verifyEvolutionWebhook
- `packages/db/src/client.ts` — Added @prisma/adapter-pg; fixed create where-injection bug
- `apps/api/src/server.ts` — buildApp accepts optional logger override

## Decisions Made

- **Prisma 7 adapter required** — Prisma 7 removed the binary engine entirely; `PrismaPg` from `@prisma/adapter-pg` bridges to `pg` driver. No alternative without downgrading.
- **`buildApp({ logger: false })`** — Fastify rejects a pino logger instance without proper Fastify wrapping in test context; optional override avoids reconfiguring production code.
- **Redis DB 15 for worker tests** — Completely isolated from dev data (DB 0); `flushdb` in `afterAll` guarantees clean state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Added @prisma/adapter-pg + pg — Prisma 7 WASM engine requires driver adapter**
- **Found during:** Task 1 (DB test infrastructure)
- **Issue:** `PrismaClient` constructor threw `PrismaClientConstructorValidationError: Using engine type "client" requires either "adapter" or "accelerateUrl"` — Prisma 7 removed the binary engine
- **Fix:** Installed `@prisma/adapter-pg` + `pg` + `@types/pg`; added `createAdapter()` factory using `DATABASE_URL`; passed adapter to `PrismaClient` constructor
- **Files modified:** `packages/db/src/client.ts`, `packages/db/package.json`, `pnpm-lock.yaml`
- **Verification:** 7 DB tests pass against live PostgreSQL on port 5434
- **Committed in:** `fb30f54`

**2. [Rule 1 - Bug] Fixed where-injection for create operations in $allOperations extension**
- **Found during:** Task 1 — Test B and Test C failed with `PrismaClientValidationError: Unknown argument 'where'`
- **Issue:** `$allOperations` middleware injected `where: { tenantId }` into ALL write operations including `create` and `createMany` — Prisma `create` has no `where` clause
- **Fix:** Split write handling: `create`/`createMany` → inject into `data` only; `update`/`delete`/`upsert`/`updateMany`/`deleteMany` → inject into `where`
- **Files modified:** `packages/db/src/client.ts`
- **Verification:** All 7 DB tests pass; isolation tests verify tenantId IS injected (via data) and isolation IS enforced (via where in reads)
- **Committed in:** `fb30f54`

**3. [Rule 1 - Bug] Fixed afterAll cleanup — FK constraint violation**
- **Found during:** Task 1 — afterAll failed with `Foreign key constraint violated on patient_tenant_id_fkey`
- **Issue:** Original cleanup tried to delete tenants before patients; also used wrong filter (`test-tenant-*` prefix) that missed dynamic test tenant IDs
- **Fix:** Identify test tenants by collecting all user.tenantId values for `@test.clinicaflow` emails, then delete in cascade order: `auditLog → patient → user → tenant`
- **Files modified:** `packages/db/src/__tests__/setup.ts`
- **Verification:** Both DB test files report `2 passed (2)` with no suite-level failures
- **Committed in:** `fb30f54`

**4. [Rule 1 - Bug] Added logger option to buildApp for test compatibility**
- **Found during:** Task 2 — API tests failed with `FastifyError: logger options only accepts a configuration object`
- **Issue:** Fastify rejected the raw pino logger instance when invoked from test env (different module resolution than production)
- **Fix:** Added optional `BuildAppOptions.logger` parameter to `buildApp()`; tests pass `{ logger: false }` to suppress output
- **Files modified:** `apps/api/src/server.ts`
- **Verification:** All 6 API tests pass
- **Committed in:** `f653852`

**5. [Rule 3 - Blocker] Excluded __tests__ from tsc build in db, api, worker tsconfigs**
- **Found during:** Task 2 — `pnpm build` on db package failed because tsc tried to compile test files with `beforeAll`/`afterAll` (not in scope for library build)
- **Fix:** Added `"src/__tests__"` to `exclude` in tsconfig.json for `packages/db`, `apps/api`, `apps/worker`
- **Files modified:** `packages/db/tsconfig.json`, `apps/api/tsconfig.json`, `apps/worker/tsconfig.json`
- **Verification:** `pnpm --filter @clinicaflow/db build` exits 0
- **Committed in:** `f653852`

---

**Total deviations:** 5 auto-fixed (2 Rule 1 bugs, 2 Rule 3 blockers, 1 Rule 1 bug)
**Impact on plan:** All auto-fixes essential for correctness (Prisma 7 engine change, where-injection bug, FK cleanup order, Fastify logger, tsc config). No scope creep.

## Issues Encountered

- Vitest 4 removed `poolOptions` — replaced with top-level `singleFork: true` (documented in Vitest 4 migration guide)
- DB credentials: docker-compose uses `clinica`/`changeme` (not `clinicaflow`/`clinicaflow`) — no `.env` file exists in repo; tests require `DATABASE_URL` env var

## Known Stubs

None — test files are complete, all assertions are real (no skipped/todo tests).

## Threat Flags

None — test files introduce no new network endpoints, auth paths, or schema changes.

## User Setup Required

Tests require these environment variables (not committed to repo):
- `DATABASE_URL=postgresql://clinica:changeme@localhost:5434/clinicaflow`
- `JWT_ACCESS_SECRET=<any string>`
- `JWT_REFRESH_SECRET=<any string>`

Docker services must be running: `docker compose up -d`

## Next Phase Readiness

- All Phase 1 FOUND requirements proven by tests (FOUND-02 through FOUND-06)
- Plan 01-10 (CI pipeline) can now reference these test suites as the gate for GitHub Actions
- Foundation complete: monorepo, auth, multi-tenant DB, queues, WhatsApp wrapper, React frontend, test suite

---
*Phase: 01-foundation*
*Completed: 2026-05-24*
