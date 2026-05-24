---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

> **Note on test strategy:** This is a greenfield project with zero existing code. All test infrastructure
> (Vitest configs, test stubs, test suites) is created in Wave 4 (Plan 09) after the implementation waves
> (Waves 1-3) are complete. This is intentional: there is no existing code to write tests against during
> Waves 1-3, and writing tests before the APIs they test exist would require speculative contracts.
> Wave 0 items (checklist below) are fulfilled by Plan 09 in Wave 4, not by a separate pre-implementation plan.
> This is the accepted test-last strategy for greenfield phase foundation work.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.7 |
| **Config file** | `packages/db/vitest.config.ts`, `apps/api/vitest.config.ts` — created in Plan 09 (Wave 4) |
| **Quick run command** | `pnpm --filter @clinicaflow/db test --run` |
| **Full suite command** | `turbo run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @clinicaflow/db test --run`
- **After every plan wave:** Run `turbo run test`
- **Before `/gsd-verify-work`:** Full suite must be green; all 3 tenant isolation tests passing
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-monorepo | 01 | 1 | FOUND-01 | — | `pnpm dev` starts api+web+worker without error | smoke | `turbo run build` | ❌ W0 | ⬜ pending |
| 1-tenant-context | 02 | 1 | FOUND-02 | T-1-01 | Query without ALS context throws SECURITY error | unit | `pnpm --filter @clinicaflow/db test --run tenant-isolation` | ❌ W0 | ⬜ pending |
| 1-tenant-isolation | 02 | 1 | FOUND-02 | T-1-01 | TenantB query never returns TenantA records | unit | `pnpm --filter @clinicaflow/db test --run tenant-isolation` | ❌ W0 | ⬜ pending |
| 1-ci-gate | 03 | 1 | FOUND-03 | T-1-01 | CI rejects merge when tenant isolation test fails | CI | `turbo run test` (GitHub Actions) | ❌ W0 | ⬜ pending |
| 1-auth-signup | 04 | 2 | FOUND-04 | T-1-02 | Signup returns JWT + sets httpOnly refresh cookie | integration | `pnpm --filter @clinicaflow/api test --run auth` | ❌ W0 | ⬜ pending |
| 1-auth-login | 04 | 2 | FOUND-04 | T-1-02 | Login returns new access token; cookie refreshed | integration | `pnpm --filter @clinicaflow/api test --run auth` | ❌ W0 | ⬜ pending |
| 1-auth-logout | 04 | 2 | FOUND-05 | T-1-03 | Logout deletes Redis key; subsequent refresh rejected 401 | integration | `pnpm --filter @clinicaflow/api test --run auth` | ❌ W0 | ⬜ pending |
| 1-audit-log | 05 | 2 | FOUND-06 | T-1-04 | Patient create generates audit_log row with no PII in metadata | integration | `pnpm --filter @clinicaflow/db test --run audit-log` | ❌ W0 | ⬜ pending |
| 1-bullmq-queues | 06 | 3 | FOUND-06 (worker) | — | Job submitted to all 5 queues is picked up and executed | integration | `pnpm --filter @clinicaflow/worker test --run queues` | ❌ W0 | ⬜ pending |
| 1-whatsapp-wrapper | 07 | 3 | D-05, D-07 | T-1-05 | Webhook with wrong apikey returns 401; valid apikey enqueues event | unit | `pnpm --filter @clinicaflow/whatsapp test --run webhook` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These items are created in Plan 09 (Wave 4) — after implementation waves are complete. See note above for rationale.

- [ ] `packages/db/vitest.config.ts` — Vitest config for db package
- [ ] `packages/db/src/__tests__/setup.ts` — test database connection setup
- [ ] `packages/db/src/__tests__/tenant-isolation.test.ts` — FOUND-02/03: no-context throws + cross-tenant returns empty
- [ ] `packages/db/src/__tests__/audit-log.test.ts` — FOUND-06: audit row exists, no PII in metadata
- [ ] `apps/api/vitest.config.ts` — Vitest config for api app
- [ ] `apps/api/src/__tests__/auth.test.ts` — FOUND-04/05: signup/login cookie + logout invalidation
- [ ] `apps/worker/vitest.config.ts` — Vitest config for worker app
- [ ] `apps/worker/src/__tests__/queues.test.ts` — all 5 queues process jobs (uses test Redis)
- [ ] `packages/whatsapp/src/__tests__/webhook.test.ts` — apikey verification
- [ ] `.github/workflows/ci.yml` — `turbo run test` on PR + branch protection rule blocking merge on failure

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `pnpm dev` starts all 3 apps from monorepo root | FOUND-01 | Requires live Docker services (Postgres, Redis, Evolution API) | Run `docker compose up -d` then `pnpm dev`; confirm api, web, worker all start without error in terminal |
| Evolution API wrapper sends message to real WhatsApp number | D-05 | Requires real WhatsApp number connected to Evolution API container | Connect instance via Evolution API UI at localhost:8080; run test script calling `sendTextMessage()`; verify message arrives |
| Redis `maxmemory-policy noeviction` is active | Pitfall 3 | Requires Docker container inspection | Run `docker compose exec redis redis-cli CONFIG GET maxmemory-policy`; confirm `noeviction` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
