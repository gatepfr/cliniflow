---
phase: 01-foundation
plan: 05
subsystem: whatsapp
tags: [evolution-api, whatsapp, webhook, http-client, fetch, lgpd, timing-safe]

# Dependency graph
requires:
  - phase: 01-04
    provides: AppError from @clinicaflow/shared used in client.ts for error throwing

provides:
  - "packages/whatsapp: Evolution API HTTP client (sendTextMessage, sendTypingIndicator, createInstance)"
  - "packages/whatsapp: Webhook verifier using timingSafeEqual (T-1-05 threat mitigation)"
  - "packages/whatsapp: extractWebhookJobData() omitting body.data (LGPD T-1-PLAN05-01)"
  - "packages/whatsapp: Full TypeScript types for Evolution API request/response shapes"

affects:
  - apps/api (webhook reception route imports verifyEvolutionWebhook)
  - apps/worker (message dispatch uses sendTextMessage; webhook-evolution queue uses EvolutionWebhookPayload)
  - 01-06 (BullMQ worker setup uses EvolutionWebhookPayload for type-safe job data)
  - 01-08 (API server implements POST /webhooks/evolution/:tenant_id using verifyEvolutionWebhook)

# Tech tracking
tech-stack:
  added:
    - "node:crypto timingSafeEqual — constant-time webhook verification"
    - "fetch (native Node.js 20) — no npm SDK for Evolution API (package deleted Dec 2023)"
  patterns:
    - "Evolution API authentication: apikey header for outbound calls, body.apikey comparison for inbound webhooks"
    - "LGPD-compliant job data: extractWebhookJobData omits body.data entirely from BullMQ job storage"
    - "Timing-safe comparison: length equalization before timingSafeEqual prevents length-timing attacks"

key-files:
  created:
    - packages/whatsapp/src/types.ts
    - packages/whatsapp/src/client.ts
    - packages/whatsapp/src/webhook.ts
    - packages/whatsapp/src/index.ts

key-decisions:
  - "Evolution API uses apikey in JSON body (not HMAC-SHA256) for webhook verification — confirmed by RESEARCH.md Pattern 5"
  - "extractWebhookJobData() deliberately omits body.data to prevent PII from entering BullMQ job storage (LGPD art. 11)"
  - "Length equalization before timingSafeEqual prevents short-circuit on length mismatch (T-1-PLAN05-03)"

patterns-established:
  - "Pattern: Evolution API outbound — 'apikey' header (not 'Authorization: Bearer')"
  - "Pattern: Evolution API inbound webhook — verify body.apikey with timingSafeEqual against EVOLUTION_API_KEY env var"
  - "Pattern: Webhook job data — only event + instance + receivedAt, never message content"

requirements-completed: [FOUND-01]

# Metrics
duration: 2min
completed: 2026-05-24
---

# Phase 1, Plan 05: Evolution API Wrapper Summary

**Evolution API HTTP client with fetch + apikey header, constant-time webhook verification via timingSafeEqual, and LGPD-compliant job data extraction omitting message content**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-24T17:23:07Z
- **Completed:** 2026-05-24T17:25:02Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- `packages/whatsapp` fully implemented and builds to `dist/` without TypeScript errors
- `verifyEvolutionWebhook()` uses `timingSafeEqual` from `node:crypto` for constant-time apikey comparison (T-1-05 threat mitigation)
- `extractWebhookJobData()` deliberately omits `body.data` so WhatsApp message content never enters BullMQ job storage (LGPD art. 11, T-1-PLAN05-01)
- Error responses from Evolution API never include response body in logs (phone numbers/content protected, T-1-PLAN05-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Evolution API types, HTTP client, and webhook verifier** - `8409bea` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/whatsapp/src/types.ts` - EvolutionWebhookPayload, SendTextRequest, SendTextResponse, CreateInstanceRequest, CreateInstanceResponse, ConnectionState
- `packages/whatsapp/src/client.ts` - sendTextMessage(), sendTypingIndicator(), createInstance() using fetch with apikey header
- `packages/whatsapp/src/webhook.ts` - verifyEvolutionWebhook() type guard with timingSafeEqual; extractWebhookJobData() omitting body.data
- `packages/whatsapp/src/index.ts` - Barrel export of all symbols

## Decisions Made

- Evolution API v2.3.7 does NOT use HMAC — it embeds `apikey` field directly in webhook JSON body. Verification compares `body.apikey` against `EVOLUTION_API_KEY` env var using constant-time comparison. (RESEARCH.md Pattern 5, MEDIUM confidence — behavior confirmed by Evolution API community docs)
- No npm SDK used — the Evolution API npm package was deleted in December 2023. All HTTP calls use native `fetch` directly.
- Length equalization added before `timingSafeEqual` to prevent timing leaks on length mismatch (T-1-PLAN05-03).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface

All threats in plan's threat model were mitigated:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-1-05 | verifyEvolutionWebhook() with timingSafeEqual |
| T-1-PLAN05-01 | extractWebhookJobData() omits body.data entirely |
| T-1-PLAN05-02 | evolutionRequest() never includes response body in error message |
| T-1-PLAN05-03 | Length equalization before timingSafeEqual comparison |

## User Setup Required

None for build. Connectivity test (D-05) requires manual setup:
- Start Evolution API container: `docker compose up evolution-api`
- Set `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` env vars
- Call `sendTextMessage()` and verify message arrives on WhatsApp (per VALIDATION.md Manual-Only Verifications)

Note: D-05 phase sign-off gate requires the manual connectivity test — this automated build does not substitute for that gate.

## Self-Check

## Self-Check: PASSED

- packages/whatsapp/src/types.ts: FOUND
- packages/whatsapp/src/client.ts: FOUND
- packages/whatsapp/src/webhook.ts: FOUND
- packages/whatsapp/src/index.ts: FOUND
- packages/whatsapp/dist/index.js: FOUND (generated by build, gitignored)
- Commit 8409bea: FOUND

## Next Phase Readiness

- `@clinicaflow/whatsapp` package is ready to be imported by `apps/api` (webhook handler) and `apps/worker` (dispatch)
- Plan 01-06 (BullMQ workers) can use `EvolutionWebhookPayload` for type-safe job data
- Plan 01-08 (API server) can use `verifyEvolutionWebhook` for the `POST /webhooks/evolution/:tenant_id` route

---
*Phase: 01-foundation*
*Completed: 2026-05-24*
