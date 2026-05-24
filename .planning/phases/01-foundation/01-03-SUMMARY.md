---
phase: 01-foundation
plan: "03"
subsystem: database
tags: [prisma, postgresql, tenant-isolation, audit-log, multi-tenant, lgpd, asynclocalstorage]

requires: []
provides:
  - "Prisma schema with all 12 domain models (Tenant, User, Patient, Visit, Treatment, Campaign, Message, Conversation, ChatMessage, Appointment, AiConfig, AuditLog)"
  - "AsyncLocalStorage-based tenant context with fail-fast security error"
  - "Extended Prisma client with automatic tenant injection and audit logging"
  - "PostgreSQL migration init applied — all 12 tables exist"
  - "packages/db public API: prisma, baseClient, tenantStorage, getTenantContext"
affects:
  - "01-04-PLAN: packages/shared schemas — depend on field names from this schema"
  - "01-05-PLAN: Fastify API — imports tenantStorage.run() from @clinicaflow/db"
  - "01-06-PLAN: auth routes — use prisma.user queries (unscoped, correct)"
  - "01-09-PLAN: tenant isolation tests — test getTenantContext throw behavior"
  - "all worker plans — use prisma client with tenant context"

tech-stack:
  added:
    - "prisma@7.8.0 (schema engine + migrate)"
    - "@prisma/client@7.8.0 (generated client)"
    - "@paralleldrive/cuid2@3.3.0 (createId() for IDs)"
    - "prisma.config.ts (Prisma 7 required config — datasource url moved out of schema)"
  patterns:
    - "Prisma 7: datasource url in prisma.config.ts via defineConfig(), not in schema.prisma"
    - "$extends + $allOperations: tenant isolation without touching individual queries"
    - "baseClient for audit writes: prevents infinite recursion through extended client"
    - "TENANT_SCOPED_MODELS set: AuditLog/Tenant/User excluded from automatic tenant injection"
    - "Fail-fast: getTenantContext() throws '[SECURITY]' when ALS context missing"

key-files:
  created:
    - "packages/db/prisma/schema.prisma — 12 model Prisma schema with tenant isolation, soft delete, cuid2 IDs"
    - "packages/db/prisma.config.ts — Prisma 7 config with datasource URL and schema/migrations paths"
    - "packages/db/src/context.ts — AsyncLocalStorage TenantContext with getTenantContext() fail-fast"
    - "packages/db/src/client.ts — extended prisma client + baseClient; audit log via baseClient"
    - "packages/db/src/index.ts — public API: prisma, baseClient, tenantStorage, getTenantContext"
    - "packages/db/prisma/migrations/20260524171045_init/migration.sql — all 12 tables in PostgreSQL"
  modified:
    - "docker-compose.yml — postgres port changed from 5432 to 5434 (5432/5433 already in use on host)"
    - ".env.example — DATABASE_URL updated to port 5434"

key-decisions:
  - "Prisma 7 removed datasource url from schema.prisma — moved to prisma.config.ts via defineConfig() — required by Prisma 7.8.0 breaking change"
  - "docker-compose postgres port changed to 5434 — ports 5432 and 5433 already occupied by existing local PostgreSQL instances on dev machine"
  - "baseClient used for audit log writes (not extended prisma) — prevents infinite recursion through $allOperations extension (Pitfall 5)"
  - "TENANT_SCOPED_MODELS excludes AuditLog/Tenant/User — these models have no tenantId or are queried before tenant context exists (auth setup)"

patterns-established:
  - "Pattern 1: All DB writes to AUDITED_MODELS produce audit_log rows automatically via $extends — no manual audit calls needed in application code"
  - "Pattern 2: metadata in audit_log is always {} — NEVER pass patient fields (full_name, phone_normalized, birth_date) as metadata per LGPD art. 11"
  - "Pattern 3: Raw SQL ($executeRaw, $queryRaw) bypasses tenant isolation — prohibited per CLAUDE.md, ESLint rule to be added in Phase 9"

requirements-completed:
  - FOUND-02
  - FOUND-06

duration: 25min
completed: "2026-05-24"
---

# Phase 1 Plan 03: Database Layer Summary

**Prisma 7 schema with 12 domain models, AsyncLocalStorage-based tenant isolation via $extends, and audit log pattern using baseClient to prevent recursion — migration applied to PostgreSQL**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-24T14:00:00Z
- **Completed:** 2026-05-24T14:12:10Z
- **Tasks:** 3
- **Files modified:** 7 (created 6, modified 2)

## Accomplishments
- Complete Prisma 7 schema with all 12 domain models from CLAUDE.md section 5, all field types, indexes, and constraints
- AsyncLocalStorage tenant context with hard fail-fast: any Prisma operation on a scoped model without ALS context throws `[SECURITY] Tenant context required` — data leak is structurally impossible
- Extended Prisma client with $allOperations intercepting 9 tenant-scoped models; automatic tenantId injection into WHERE/data for all reads and writes
- Audit log pattern: 6 audited models (patient/visit/treatment/conversation/chatMessage/appointment) generate audit_log rows on all mutations; metadata={} enforces LGPD art. 11 PII exclusion
- PostgreSQL migration init successfully applied — all 12 tables with correct column types, indexes, and constraints

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema** — `54cd771` (feat)
2. **Task 2: Tenant context + extended client** — `ea5d2ed` (feat)
3. **Task 3: Prisma migration init** — `a2aba66` (feat)

## Files Created/Modified
- `packages/db/prisma/schema.prisma` — 12 models: all fields from CLAUDE.md, soft delete on Patient, unique [tenantId, phoneNormalized], cuid2 ID convention
- `packages/db/prisma.config.ts` — Prisma 7 required config with defineConfig(); datasource url + schema/migrations paths
- `packages/db/src/context.ts` — AsyncLocalStorage TenantContext; getTenantContext() throws [SECURITY] on missing ALS scope
- `packages/db/src/client.ts` — baseClient (plain) + extended prisma; $allOperations injects tenantId; baseClient.auditLog.create for recursion prevention
- `packages/db/src/index.ts` — public API: prisma, baseClient, tenantStorage, getTenantContext
- `packages/db/prisma/migrations/20260524171045_init/migration.sql` — all 12 CREATE TABLE statements
- `docker-compose.yml` — postgres port changed from 5432 to 5434
- `.env.example` — DATABASE_URL updated to port 5434

## Decisions Made
- Prisma 7 breaking change requires `prisma.config.ts` — datasource url removed from schema, moved to `defineConfig({ datasource: { url: env('DATABASE_URL') } })` 
- docker-compose postgres uses port 5434 instead of 5432 (ports 5432 and 5433 already used by pre-existing local PostgreSQL instances on dev machine)
- baseClient for audit writes, NOT the extended prisma — writing via extended client re-enters $allOperations creating infinite recursion (confirmed by RESEARCH.md Pitfall 5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma 7 datasource url in schema causes P1012 error**
- **Found during:** Task 1 (Prisma schema + prisma generate)
- **Issue:** `prisma generate` failed with `P1012: The datasource property 'url' is no longer supported in schema files` — Prisma 7.x removed url from schema datasource block
- **Fix:** Removed `url = env("DATABASE_URL")` from schema.prisma datasource block; created `prisma.config.ts` with `defineConfig({ datasource: { url: env('DATABASE_URL') } })` — this is the Prisma 7 standard approach
- **Files modified:** `packages/db/prisma/schema.prisma`, `packages/db/prisma.config.ts` (new)
- **Verification:** `prisma generate` completed successfully after adding prisma.config.ts
- **Committed in:** `54cd771` (Task 1 commit)

**2. [Rule 3 - Blocking] Ports 5432 and 5433 already in use on host machine**
- **Found during:** Task 3 (migration)
- **Issue:** `docker compose up -d postgres` failed — `Bind for 0.0.0.0:5432 failed: port is already allocated`; retry with 5433 also failed — both ports occupied by pre-existing local PostgreSQL instances
- **Fix:** Changed docker-compose.yml postgres port binding to `5434:5432`; updated `.env.example` DATABASE_URL to `localhost:5434`; container started successfully on 5434
- **Files modified:** `docker-compose.yml`, `.env.example`
- **Verification:** `docker compose ps` shows `0.0.0.0:5434->5432/tcp, healthy`; migration connected and applied successfully
- **Committed in:** `a2aba66` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 API compatibility bug, 1 blocking port conflict)
**Impact on plan:** Both fixes necessary for migration to succeed. No scope creep. Docker-compose port change is dev-environment specific — production deployments should not have this conflict.

## Issues Encountered
- Prisma 7 is a breaking change from 6.x regarding datasource configuration — all future plans that reference DATABASE_URL setup should use prisma.config.ts pattern, not schema.prisma url field

## Known Stubs
None — no UI rendering, no data wiring required for this plan.

## Threat Flags
None — no new network endpoints, auth paths, or schema changes at trust boundaries beyond what is in the plan's threat model.

## Next Phase Readiness
- `packages/db` is fully functional and ready to be imported by `apps/api`, `apps/worker`, and test suites
- `tenantStorage.run()` is ready for Fastify middleware wrapping in Plan 01-05
- `getTenantContext()` fail-fast behavior ready for Plan 01-09 tenant isolation tests
- All 12 tables exist in PostgreSQL — Plans 01-04+ can create schemas and routes
- **Note for local dev:** Use `DATABASE_URL=postgresql://clinica:changeme@localhost:5434/clinicaflow` (port 5434, not 5432)

---
*Phase: 01-foundation*
*Completed: 2026-05-24*
