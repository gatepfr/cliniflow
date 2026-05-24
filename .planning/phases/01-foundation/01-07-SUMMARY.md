---
phase: 01-foundation
plan: "07"
subsystem: worker
tags: [bullmq, redis, worker, queues, sentry, dlq]
dependency_graph:
  requires:
    - "01-03 (packages/shared QUEUE_NAMES)"
    - "01-04 (packages/db Prisma client)"
  provides:
    - "BullMQ worker process with 5 queues operational"
    - "DLQ pattern with Sentry reporting"
    - "Typed job data interfaces for all queues"
  affects:
    - "apps/worker (all files)"
tech_stack:
  added:
    - "BullMQ 5.77.1 Worker + Queue"
    - "ioredis 5.10.1 (named ESM import { Redis })"
    - "@sentry/node 10.53.1"
    - "pino 10.3.1"
  patterns:
    - "Single worker process (D-08) managing all 5 queues"
    - "Exponential backoff via backoffStrategy hook (D-10)"
    - "DLQ pattern: worker.on('failed') + attemptsMade >= maxAttempts"
    - "maxRetriesPerRequest: null on worker connection (BullMQ Pitfall 6)"
key_files:
  created:
    - apps/worker/src/lib/redis.ts
    - apps/worker/src/queues/campaign-dispatch.ts
    - apps/worker/src/queues/ai-conversation.ts
    - apps/worker/src/queues/appointment-confirm.ts
    - apps/worker/src/queues/recall-scheduler.ts
    - apps/worker/src/queues/webhook-evolution.ts
  modified:
    - apps/worker/src/index.ts
decisions:
  - "defaultJobOptions belongs on Queue (producer) not Worker (consumer) — retry policy enforced at enqueue time"
  - "Generic type parameter uses any to avoid exactOptionalPropertyTypes incompatibility with specific job data interfaces"
  - "dlqConnection uses separate ioredis instance (no maxRetriesPerRequest: null) — it is a producer, not a worker"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-24"
  tasks_completed: 1
  files_created: 7
---

# Phase 1 Plan 07: BullMQ Worker Process Summary

**One-liner:** Single worker process managing 5 typed BullMQ queues with exponential backoff, DLQ pattern, and Sentry error reporting — all queue processors are typed stubs ready for Phase 2-5 implementation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Worker Redis connection, queue processor stubs, and main worker entry point | 665b6f9 | 7 files created/modified |

## What Was Built

The `apps/worker` package now has a fully operational BullMQ worker process:

**`apps/worker/src/lib/redis.ts`**
- `workerConnection`: ioredis instance with `maxRetriesPerRequest: null` (mandatory for BullMQ workers — prevents worker crash on Redis reconnect)
- `dlqConnection`: separate ioredis instance for the DLQ producer

**Queue processor stubs** (5 files in `apps/worker/src/queues/`):
- Each exports a typed processor function and a job data interface
- All job data interfaces contain only IDs — no PII fields (LGPD art. 11 compliance)
- `campaign-dispatch.ts`: `CampaignDispatchJobData` — Phase 3 target
- `ai-conversation.ts`: `AiConversationJobData` — Phase 4 target
- `appointment-confirm.ts`: `AppointmentConfirmJobData` — Phase 5 target
- `recall-scheduler.ts`: `RecallSchedulerJobData` — Phase 2/3 target
- `webhook-evolution.ts`: `WebhookEvolutionJobData` — Phase 4 target

**`apps/worker/src/index.ts`** (main entry):
- Initializes Sentry if `SENTRY_DSN` env var is set
- Creates all 5 workers with correct concurrency per D-09
- `backoffStrategy` hook implements exponential backoff capped at 30s (D-10)
- `worker.on('failed')` moves jobs to DLQ after `maxAttempts` exhausted
- Sentry reports include `jobId`, `queue`, `attemptsMade` — no PII
- SIGTERM/SIGINT handlers for graceful shutdown

## Concurrency (D-09)

| Queue | Concurrency | Rationale |
|-------|-------------|-----------|
| campaign-dispatch | 5 | Limited by WhatsApp rate limit |
| ai-conversation | 10 | I/O-bound, waits for Claude API |
| appointment-confirm | 3 | Low volume |
| recall-scheduler | 1 | Daily job, sequential |
| webhook-evolution | 20 | Fast, lightweight processing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `defaultJobOptions` removed from WorkerOptions**
- **Found during:** Task 1, TypeScript build
- **Issue:** `defaultJobOptions` does not exist on `WorkerOptions` in BullMQ v5 — it belongs on `Queue` (the producer). TypeScript error TS2353.
- **Fix:** Removed `defaultJobOptions` from the Worker constructor. Retry policy (attempts, backoff) is enforced at the producer side when jobs are enqueued in Phases 3-5.
- **Files modified:** `apps/worker/src/index.ts`
- **Commit:** 665b6f9

**2. [Rule 1 - Bug] Generic type constraint relaxed from `Record<string, unknown>` to `any`**
- **Found during:** Task 1, TypeScript build
- **Issue:** With `exactOptionalPropertyTypes: true`, specific job data interfaces (e.g. `CampaignDispatchJobData`) are not assignable to `Job<Record<string, unknown>>` because the generic constraint requires all properties to be present on the base type. TypeScript errors TS2345.
- **Fix:** `createWorker` uses `any` for the job data generic. The individual processor files maintain full type safety via their own typed `Job<T>` parameters.
- **Files modified:** `apps/worker/src/index.ts`
- **Commit:** 665b6f9

## Known Stubs

All 5 queue processor functions are intentional stubs — this is the plan's stated goal for Phase 1. Each stub documents which phase will implement the business logic:

| File | Stub | Resolved In |
|------|------|-------------|
| `queues/campaign-dispatch.ts` | `processCampaignDispatch` | Phase 3 |
| `queues/ai-conversation.ts` | `processAiConversation` | Phase 4 |
| `queues/appointment-confirm.ts` | `processAppointmentConfirm` | Phase 5 |
| `queues/recall-scheduler.ts` | `processRecallScheduler` | Phase 2/3 |
| `queues/webhook-evolution.ts` | `processWebhookEvolution` | Phase 4 |

These stubs do not prevent the plan's goal: the worker process starts, registers all 5 queues, and the DLQ+Sentry pipeline is wired. FOUND-01 criterion 5 is now testable (Plan 09 will verify job pickup).

## Threat Surface

No new network endpoints introduced. Sentry payload reviewed: contains only `jobId`, `queue`, `attemptsMade` — no patient data (T-1-PLAN07-02 mitigated). DLQ job data contains only IDs (T-1-PLAN07-01 mitigated). Worker connection uses `maxRetriesPerRequest: null` (T-1-PLAN07-03 mitigated).

## Self-Check: PASSED

- `apps/worker/src/lib/redis.ts` — FOUND
- `apps/worker/src/queues/campaign-dispatch.ts` — FOUND
- `apps/worker/src/queues/ai-conversation.ts` — FOUND
- `apps/worker/src/queues/appointment-confirm.ts` — FOUND
- `apps/worker/src/queues/recall-scheduler.ts` — FOUND
- `apps/worker/src/queues/webhook-evolution.ts` — FOUND
- `apps/worker/src/index.ts` — FOUND
- Commit 665b6f9 — FOUND (verified via git log)
- TypeScript build: exit 0 — PASSED
