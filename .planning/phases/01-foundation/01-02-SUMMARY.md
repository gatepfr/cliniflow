---
phase: 01-foundation
plan: 02
subsystem: infra
tags: [docker, docker-compose, postgres, redis, bullmq, evolution-api, whatsapp]

requires: []

provides:
  - docker-compose.yml with PostgreSQL 16, Redis 7 (noeviction), Evolution API v2.3.7
  - .env.example documenting all 11 environment variables with placeholder values
  - .gitignore preventing .env, node_modules, dist, .turbo, .next from being committed
  - .npmrc with shamefully-hoist + strict-peer-dependencies for Turborepo/shadcn workspace compat

affects:
  - 01-03-PLAN (Prisma schema — connects to postgres via DATABASE_URL)
  - 01-07-PLAN (whatsapp wrapper — connects to evolution-api:8080 via EVOLUTION_API_URL)
  - 01-08-PLAN (BullMQ workers — connects to redis via REDIS_HOST/REDIS_PORT)
  - All plans requiring docker compose dev environment (D-06)

tech-stack:
  added:
    - postgres:16 (Docker image)
    - redis:7-alpine (Docker image)
    - evoapicloud/evolution-api:v2.3.7 (Docker image)
  patterns:
    - Evolution API uses separate PostgreSQL schema (evolution_api) from app DB (clinicaflow)
    - Redis maxmemory-policy noeviction — mandatory for BullMQ job safety
    - Health-check-gated depends_on prevents evolution-api startup before DB/Redis ready
    - env vars default to dev-safe values (${VAR:-fallback}) in docker-compose.yml

key-files:
  created:
    - docker-compose.yml
    - .env.example
  modified:
    - .gitignore (added .next/ and out/ build artifacts)
    - .npmrc (added shamefully-hoist=true and strict-peer-dependencies=false)

key-decisions:
  - "Redis maxmemory-policy noeviction set via docker-compose command: — prevents silent BullMQ key eviction leading to duplicate campaign sends and WhatsApp ban risk"
  - "Evolution API uses evoapicloud/evolution-api:v2.3.7 — not atendai (v1 only) or latest (RC)"
  - "Evolution API uses separate DB schema evolution_api within same postgres container — avoids second container"
  - "shamefully-hoist=true in .npmrc required for Turborepo + shadcn/ui peer dependency resolution in pnpm workspace"
  - ".npmrc keeps enable-pre-post-scripts=true from Plan 01-01 (required for Prisma engine binary)"

patterns-established:
  - "Pattern: docker-compose healthcheck-gated depends_on — services start in order: postgres -> redis -> evolution-api"
  - "Pattern: env var fallbacks in docker-compose (${VAR:-default}) — zero manual config for dev (D-06)"

requirements-completed:
  - FOUND-01

duration: 15min
completed: 2026-05-24
---

# Phase 1, Plan 02: Dev Infrastructure Summary

**docker-compose.yml with postgres:16, redis:7-alpine (noeviction), evoapicloud/evolution-api:v2.3.7 — zero-config dev environment satisfying D-06**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-24T17:00:00Z
- **Completed:** 2026-05-24T17:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Full three-service Docker dev environment ready — `docker compose up -d` starts PostgreSQL 16, Redis 7, and Evolution API without any manual configuration
- Redis configured with `maxmemory-policy noeviction` — prevents silent BullMQ job loss that would cause duplicate campaign sends and WhatsApp ban risk (Pitfall 3 from RESEARCH.md)
- `.env.example` documents all required variables (postgres, redis, JWT, Evolution API, Sentry, app) with safe placeholder values that will not accidentally work in production
- `.npmrc` updated with `shamefully-hoist=true` and `strict-peer-dependencies=false` for Turborepo + shadcn/ui workspace compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: docker-compose.yml** - `8d1c58b` (chore)
2. **Task 2: .env.example, .gitignore, .npmrc** - `9317cec` (chore)

**Plan metadata:** _(to be added after final commit)_

## Files Created/Modified

- `docker-compose.yml` - Three-service dev environment: postgres:16, redis:7-alpine (noeviction), evoapicloud/evolution-api:v2.3.7 with healthcheck-gated startup order
- `.env.example` - 11 env vars with placeholder values: POSTGRES_USER, POSTGRES_PASSWORD, DATABASE_URL, REDIS_HOST, REDIS_PORT, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_TTL, EVOLUTION_API_URL, EVOLUTION_API_KEY, SENTRY_DSN
- `.gitignore` - Added `.next/` and `out/` build artifact entries (existing .env, node_modules, dist, .turbo already present from Plan 01-01)
- `.npmrc` - Added `shamefully-hoist=true` and `strict-peer-dependencies=false` (kept `enable-pre-post-scripts=true` from Plan 01-01)

## Decisions Made

- `shamefully-hoist=true` added to existing `.npmrc` — required for Turborepo + shadcn/ui to resolve peer dependencies correctly in pnpm workspace; `strict-peer-dependencies=false` avoids CI failures from React 19 + shadcn peer dep warnings
- Evolution API uses `evolution_api` schema (not database) within the same `postgres` container — avoids adding a fourth container while maintaining logical separation
- `LOG_LEVEL: ERROR` for Evolution API container in dev — reduces noise from verbose INFO logs during development

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Retained enable-pre-post-scripts=true in .npmrc**
- **Found during:** Task 2 (.npmrc update)
- **Issue:** Plan spec showed only `shamefully-hoist=true` and `strict-peer-dependencies=false`, but Plan 01-01 already established `enable-pre-post-scripts=true` as required for Prisma engine binary compilation
- **Fix:** Kept all three entries: `enable-pre-post-scripts=true` (existing) + two new entries
- **Files modified:** `.npmrc`
- **Verification:** Both new entries present, existing entry preserved
- **Committed in:** `9317cec` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical: preserved required pnpm config)
**Impact on plan:** Additive only — no plan intent changed. .npmrc now has all three required entries.

## Issues Encountered

None - `.gitignore` and `.npmrc` already existed from Plan 01-01 so they were updated in place rather than created from scratch. Content from Plan 01-01 was correct and complementary to this plan's additions.

## Known Stubs

None - this plan delivers infrastructure configuration files with no application code stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: exposed-ports-dev | docker-compose.yml | PostgreSQL 5432, Redis 6379, Evolution API 8080 exposed on all interfaces — dev only, acceptable per T-1-PLAN02-04 (accepted risk) |

Note: T-1-PLAN02-01 (`.env` committed) mitigated via `.gitignore`. T-1-PLAN02-02 (Evolution API default key) documented in `.env.example` comment. T-1-PLAN02-03 (Redis eviction) mitigated via `noeviction` command.

## Next Phase Readiness

- Dev environment ready — subsequent plans can `docker compose up -d` for local development
- `DATABASE_URL` in `.env.example` points to postgres container — Plan 01-03 (Prisma schema) can connect immediately after copying `.env`
- Evolution API at `http://localhost:8080` ready for Plan 01-07 (WhatsApp wrapper) integration tests
- Redis at `localhost:6379` ready for Plan 01-08 (BullMQ worker setup)

## Self-Check

Checking all claims before finalizing...

---
*Phase: 01-foundation*
*Completed: 2026-05-24*
