---
phase: 01-foundation
plan: 10
subsystem: ci-pipeline
tags: [ci, github-actions, testing, api-entrypoint]
dependency_graph:
  requires: [01-09]
  provides: [ci-enforcement, api-production-entrypoint]
  affects: [all-future-plans]
tech_stack:
  added: [github-actions, pnpm-action-setup@v4, actions/setup-node@v4]
  patterns: [turbo-run-test, prisma-migrate-deploy-in-ci, service-containers]
key_files:
  created:
    - .github/workflows/ci.yml
    - apps/api/src/index.ts
  modified: []
decisions:
  - "CI uses pull_request trigger (not pull_request_target) to prevent secret exfiltration via PR injection"
  - "Worker TypeScript verified via dedicated build step (no test runner for worker in CI)"
  - "prisma migrate deploy (not dev) in CI — applies existing migrations only"
  - "Placeholder secrets in workflow — no real credentials; production secrets go in GitHub Actions Secrets"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-24"
  tasks_completed: 1
  tasks_total: 1
  files_created: 2
  files_modified: 0
---

# Phase 1 Plan 10: CI Pipeline Summary

**One-liner:** GitHub Actions CI with postgres:16 + redis:7-alpine services running `turbo run test` on every PR, plus production API entry point calling `startServer()`.

## What Was Built

### Task 1: CI workflow file and API production entry point (commit: 1fddfdc)

**`.github/workflows/ci.yml`** — GitHub Actions CI pipeline:
- Triggers on `push` and `pull_request` to `main`
- Service containers: `postgres:16` (port 5432) + `redis:7-alpine` (port 6379) with health checks
- pnpm 10.33.2 + Node.js 20 LTS with `--frozen-lockfile` install
- Runs `prisma migrate deploy` (not `dev`) to apply existing migrations
- Builds `@clinicaflow/shared`, `@clinicaflow/db`, `@clinicaflow/whatsapp` packages
- Builds `@clinicaflow/worker` for TypeScript compile verification
- Runs `pnpm turbo run test` — CI fails and blocks merge if any test fails (FOUND-03)
- Uploads coverage artifacts on completion
- Job name is exactly `test` under `jobs.test` — matches branch protection status check name

**`apps/api/src/index.ts`** — production entry point:
- Imports `startServer` from `./server.js`
- Calls `startServer()`, catches fatal errors, exits with code 1 on failure

## Deviations from Plan

None — plan executed exactly as written.

## Checkpoint Required

**Type:** human-verify (blocking)

This plan requires manual GitHub steps before Phase 1 can be considered fully complete:

1. Initialize git repository (already done — commits exist locally)
2. Create a private GitHub repository and push
3. Open a PR from a test branch to trigger the CI workflow
4. Verify CI job "Test" completes green
5. Configure branch protection: Settings → Branches → Add rule for `main`, require "Test" status check

See checkpoint details in the plan (`01-10-PLAN.md`) for exact steps.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ci-injection | .github/workflows/ci.yml | Uses `pull_request` (not `pull_request_target`) — untrusted PR code cannot access secrets (T-1-PLAN10-01 mitigated) |

## Self-Check: PASSED

- [x] `.github/workflows/ci.yml` exists
- [x] `apps/api/src/index.ts` exists
- [x] Commit `1fddfdc` exists in git log
- [x] `turbo run test` present in ci.yml
- [x] `postgres:16` service container in ci.yml
- [x] `redis:7-alpine` service container in ci.yml
- [x] `prisma migrate deploy` in ci.yml
- [x] `worker build` step in ci.yml
- [x] `startServer` imported and called in index.ts
- [x] `frozen-lockfile` in install step
