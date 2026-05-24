---
phase: 01-foundation
plan: "04"
subsystem: shared
tags: [zod, cuid2, bullmq, typescript, error-handling]

# Dependency graph
requires:
  - phase: 01-01
    provides: monorepo structure with packages/shared directory and package.json configured

provides:
  - AppError class for operational error handling across all apps
  - createId() helper using @paralleldrive/cuid2
  - QUEUE_NAMES constants for BullMQ queue names
  - Shared TypeScript types (UserRole, ConversationStatus, AppointmentStatus, MessageStatus, CampaignStatus, etc.)
  - SignupSchema and LoginSchema Zod schemas with PT-BR error messages
  - Single barrel export from packages/shared

affects: [01-06-auth-routes, 01-07-worker, all plans that import from @clinicaflow/shared]

# Tech tracking
tech-stack:
  added:
    - "@paralleldrive/cuid2 3.3.0 — collision-resistant ID generation"
    - "zod 4.4.3 — runtime validation with TypeScript inference"
  patterns:
    - "AppError(code, message, statusCode) as the single error class for all operational errors"
    - "createId() called in application code before Prisma inserts (Prisma schema has no @default() on IDs)"
    - "QUEUE_NAMES as const object with 6 keys (5 queues + dead-letter)"
    - "Zod v4 uses error: string param (not deprecated required_error) for string validation messages"

key-files:
  created:
    - packages/shared/src/errors.ts
    - packages/shared/src/ids.ts
    - packages/shared/src/queues.ts
    - packages/shared/src/types.ts
    - packages/shared/src/schemas/auth.ts
    - packages/shared/src/schemas/index.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "Zod v4 required_error param is deprecated — use error param instead (TypeScript compile error enforces this)"
  - "LoginSchema has .max(100) on password field to prevent bcrypt DoS attack (bcrypt silently truncates at 72 bytes)"
  - "QUEUE_NAMES includes DEAD_LETTER as 6th key per plan spec (5 operational queues + 1 DLQ)"

patterns-established:
  - "Pattern: All Zod schema files under packages/shared/src/schemas/ and re-exported via schemas/index.ts"
  - "Pattern: packages/shared/src/index.ts is single entry point for all shared symbols"
  - "Pattern: TypeScript NodeNext modules require .js extension on imports"

requirements-completed: [FOUND-01, FOUND-04, FOUND-05]

# Metrics
duration: 4min
completed: 2026-05-24
---

# Phase 01 Plan 04: Shared Package Summary

**AppError class, createId() with cuid2, QUEUE_NAMES constants (6 queues), shared TypeScript domain types, and Zod v4 auth schemas with PT-BR error messages — all barrel-exported from @clinicaflow/shared**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-24T17:16:12Z
- **Completed:** 2026-05-24T17:19:51Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `AppError` class with `code`, `message`, `statusCode`, `details` and `toJSON()` that never leaks stack traces
- `createId()` using `@paralleldrive/cuid2` (not deprecated `cuid`) as the single ID generation function
- `QUEUE_NAMES` with exactly 6 string constants matching CLAUDE.md section 4.3 queue names plus dead-letter queue
- 8 shared TypeScript types covering all domain status enums (UserRole, ConversationStatus, AppointmentStatus, MessageStatus, CampaignStatus, TreatmentStatus, TenantPlan, AppointmentSource)
- `SignupSchema` (tenantName, email, password, name) and `LoginSchema` (email, password) with PT-BR error messages, email normalized to lowercase
- All symbols re-exported from `packages/shared/src/index.ts`; `pnpm --filter @clinicaflow/shared build` completes without TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: AppError, createId, QUEUE_NAMES, shared types** - `03154d8` (feat)
2. **Task 2: Zod auth schemas and barrel export (index.ts)** - `9acbf9b` (feat)

**Plan metadata:** (committed after SUMMARY.md creation)

## Files Created/Modified

- `packages/shared/src/errors.ts` — AppError class with code, message, statusCode, details; toJSON() returns safe error shape
- `packages/shared/src/ids.ts` — createId() wrapping @paralleldrive/cuid2
- `packages/shared/src/queues.ts` — QUEUE_NAMES const with 6 BullMQ queue name strings + QueueName type
- `packages/shared/src/types.ts` — Shared domain types: UserRole, ConversationStatus, AppointmentStatus, MessageStatus, CampaignStatus, TreatmentStatus, TenantPlan, AppointmentSource
- `packages/shared/src/schemas/auth.ts` — SignupSchema, LoginSchema, RefreshSchema, LogoutSchema with PT-BR messages
- `packages/shared/src/schemas/index.ts` — Schema subdirectory barrel export
- `packages/shared/src/index.ts` — Main barrel export for entire @clinicaflow/shared package

## Decisions Made

- **Zod v4 `error` param instead of `required_error`:** The `required_error` parameter was deprecated in Zod v4 and removed from TypeScript types. Using `error: 'message'` is the correct v4 API. This was a blocking compile error (Rule 1 auto-fix).
- **LoginSchema gets `.max(100)` on password:** T-1-PLAN04-03 threat model mitigation — bcrypt silently truncates at 72 bytes, allowing attackers to craft identical hashes with different long passwords. Applied per threat model.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 `required_error` param removed from TypeScript types**
- **Found during:** Task 2 (Zod auth schemas)
- **Issue:** Plan code used `z.string({ required_error: '...' })` which is Zod v3 API. Zod 4.4.3 (installed) removed `required_error` from TypeScript type definitions — TypeScript compilation failed with TS2769 errors on all 6 string fields.
- **Fix:** Replaced `required_error` with `error` param per Zod v4 API (`z.string({ error: '...' })`). The functionality is identical — `error` is the unified param for all error types in v4.
- **Files modified:** `packages/shared/src/schemas/auth.ts`
- **Verification:** `pnpm --filter @clinicaflow/shared build` passes without errors
- **Committed in:** `9acbf9b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — Zod v4 API change)
**Impact on plan:** Auto-fix necessary for compilation. No scope change. All plan requirements met.

## Issues Encountered

Zod v4 breaking change: `required_error` was removed from TypeScript types (still works at runtime but fails type checking). Plan was written assuming Zod v3 API. Fixed with correct v4 `error` param.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `@clinicaflow/shared` is fully built and ready for import in all apps
- Auth routes (Plan 06) can import `SignupSchema`, `LoginSchema` directly
- Worker (Plan 07) can import `QUEUE_NAMES` for BullMQ queue registration
- All apps can use `AppError` for operational error handling and `createId()` for ID generation
- No blockers for subsequent plans

---
*Phase: 01-foundation*
*Completed: 2026-05-24*
