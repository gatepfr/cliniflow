# Roadmap: ClínicaFlow

**Total phases:** 6
**Requirements covered:** 54/54 ✓
**Granularity:** Standard
**Updated:** 2026-05-24

---

## Phases

- [ ] **Phase 1: Foundation** - Monorepo, multi-tenant isolation, auth, queues, and WhatsApp wrapper — the safe base everything else is built on
- [ ] **Phase 2: Data & Configuration** - Patient import, automatic segmentation, and per-clinic AI configuration
- [ ] **Phase 3: Campaign Engine** - Campaign builder, WhatsApp dispatch with rate limiting, and webhook infrastructure
- [ ] **Phase 4: AI Conversation & Inbox** - Inbound message handling, AI conversational loop with guardrails, and clinic inbox UI
- [ ] **Phase 5: Appointment Confirmation & ROI Dashboard** - Automated confirmations, no-show recovery, and the revenue recovery dashboard
- [ ] **Phase 6: Onboarding & Billing** - Trial flow, subscription via Pagar.me, activation checklist, and GTM emails

---

## Phase Details

### Phase 1: Foundation
**Goal**: The developer can run a multi-tenant API with auth, queue workers, and WhatsApp connectivity — and be certain no query can leak data across tenants.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**UI hint**: no

### Success Criteria (what must be TRUE)
1. `pnpm dev` starts all apps (api, web, worker) from the monorepo root without error; each app resolves shared packages via workspace aliases.
2. A test that calls any Prisma query without an active `AsyncLocalStorage` tenant context fails at the middleware layer — not at query time — and the CI suite rejects the merge.
3. A user can sign up, receive a JWT + httpOnly refresh token cookie, log in on a new browser tab, and log out with the session immediately invalidated on the server.
4. Every create/read/update on a patient record produces an `audit_log` row containing `action`, `entity`, `entity_id`, `user_id`, and `tenant_id` — with no PII in the `metadata` column.
5. A BullMQ job submitted to any of the five named queues (`campaign-dispatch`, `ai-conversation`, `appointment-confirm`, `recall-scheduler`, `webhook-evolution`) is picked up by the worker process and executed; Redis is configured with `maxmemory-policy noeviction`.

**Plans**: 10 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold: root workspace config, pnpm workspaces, Turborepo pipeline, tsconfig.base.json, all 8 package.json files ✓ 2026-05-24
- [x] 01-02-PLAN.md — Docker Compose environment: PostgreSQL 16, Redis 7 (noeviction), Evolution API v2.3.7, .env.example, .gitignore ✓ 2026-05-24
- [x] 01-03-PLAN.md — Prisma schema (12 models), tenant ALS context, extended client with tenant isolation + audit log, [BLOCKING] migration ✓ 2026-05-24
- [x] 01-04-PLAN.md — packages/shared: AppError, createId (cuid2), QUEUE_NAMES, Zod auth schemas (PT-BR), shared types ✓ 2026-05-24
- [x] 01-05-PLAN.md — packages/whatsapp: Evolution API HTTP client, webhook apikey verifier (constant-time), PII-safe job data extraction ✓ 2026-05-24
- [x] 01-06-PLAN.md — apps/api: Fastify server, auth plugin, tenant middleware, auth routes (signup/login/refresh/logout), webhook handler ✓ 2026-05-24
- [x] 01-07-PLAN.md — apps/worker: BullMQ worker process, 5 queues with correct concurrency, exponential retry, DLQ + Sentry ✓ 2026-05-24
- [x] 01-08-PLAN.md — apps/web: React 19 + Vite + Tailwind v4 CSS-first scaffold (no tailwind.config.js) ✓ 2026-05-24
- [x] 01-09-PLAN.md — Test suite: tenant isolation tests A/B/C, auth integration tests, queue smoke tests, webhook unit tests (32 tests, all green) ✓ 2026-05-24
- [ ] 01-10-PLAN.md — CI pipeline: GitHub Actions workflow + branch protection instructions

---

### Phase 2: Data & Configuration
**Goal**: A clinic can upload its patient base, see it segmented automatically, and configure how the AI will speak on its behalf — the raw material every campaign depends on.
**Depends on**: Phase 1
**Requirements**: IMPORT-01, IMPORT-02, IMPORT-03, IMPORT-04, IMPORT-05, IMPORT-06, SEG-01, SEG-02, SEG-03, SEG-04, SEG-05, AICONF-01, AICONF-02, AICONF-03, AICONF-04, AICONF-05, AICONF-06
**UI hint**: yes

### Success Criteria (what must be TRUE)
1. A user uploads a 50 000-row CSV or Excel file (including Windows-1252 encoding and BOM variants) and sees a column-mapping wizard with auto-suggested mappings; the import completes in under 2 minutes and shows a report with error rows available for download.
2. Reimporting the same base after patients have had records updated does not overwrite existing active patient data — new rows are added, existing rows are merged by normalized phone number.
3. After import, the dashboard shows segment sizes for: inactive 3-6 m, 6-12 m, 12-24 m, 24 m+, birthday this month, treatment in progress, and recall due — all computed automatically with no manual input.
4. A user opens the AI configuration screen, edits the base prompt, selects a tone, uploads a FAQ, sets business hours, and adds trigger words; a test message typed into the preview pane produces a response using the new configuration without saving to production.
5. The clinical restrictions section is visible but all its fields are read-only — no UI interaction can remove or bypass the guardrail text.

**Plans**: TBD

---

### Phase 3: Campaign Engine
**Goal**: A clinic can build a targeted campaign, send it to a patient segment via WhatsApp with each message uniquely rewritten by AI, and trust that rate limits and delivery windows are enforced automatically.
**Depends on**: Phase 2
**Requirements**: CAMP-01, CAMP-02, CAMP-03, CAMP-04, CAMP-05, CAMP-06, CAMP-07, WA-01, WA-02, WA-03, WA-04, WA-05
**UI hint**: yes

### Success Criteria (what must be TRUE)
1. A user creates a campaign by picking a segment (seeing its size), choosing one of the 6 built-in odontology templates, inserting dynamic variables, and scheduling it — the campaign enters the dispatch queue and begins sending only between 09:00–20:00 on weekdays (excluding national holidays).
2. Each dispatched message has a unique AI-rewritten body (no two patients receive the same text), preceded by a typing indicator and followed by a 3–15 s random delay; the Evolution API webhook updates each message's status (sent / delivered / read / failed) in real time on the campaign screen.
3. A user can pause a running campaign and resume it later without any already-queued messages being sent twice; cancelling a campaign stops all pending jobs cleanly.
4. A new WhatsApp number is blocked from mass dispatch until a 7-day warm-up sequence (with progressively increasing daily volume) is complete.
5. Reprocessing a BullMQ job that already dispatched a message (simulating a worker crash) does not send the message a second time — idempotency is enforced via Redis.
6. A campaign configured with two message variants (A/B test) distributes sends across both variants and surfaces response-rate comparison on the campaign detail screen.

**Plans**: TBD

---

### Phase 4: AI Conversation & Inbox
**Goal**: When a patient replies to a campaign, the AI handles the conversation end-to-end — qualifying, answering from the clinic FAQ, and handing off to a human when needed — while the clinic team has a single inbox to monitor and take over.
**Depends on**: Phase 3
**Requirements**: AICONV-01, AICONV-02, AICONV-03, AICONV-04, AICONV-05, AICONV-06, AICONV-07, AICONV-08, INBOX-01, INBOX-02, INBOX-03, INBOX-04
**UI hint**: yes

### Success Criteria (what must be TRUE)
1. An inbound patient message triggers an AI response in under 30 seconds; first-turn triage uses Claude Haiku and subsequent turns use Claude Sonnet; FAQ answers are served from a Redis cache (TTL 1 h) without calling the AI.
2. Any AI-generated message that contains a diagnosis, a treatment-outcome promise, or an unconfirmed price is blocked by the post-generation code filter before sending and immediately escalated to a human — this behavior cannot be disabled via prompt or configuration.
3. When a configured trigger word (e.g., "dor forte", "sangramento", "emergência") appears in a patient message, the AI immediately stops responding and flags the conversation for human pickup, including a summary of the conversation context.
4. After 8 turns without a booking, the AI hands the conversation to a human; conversations idle for 24 hours are closed automatically; patients who do not reply within 3 days receive a follow-up, and again at 7 days if still silent.
5. The clinic inbox shows all active conversations with a clear visual indicator distinguishing AI-managed from awaiting-human conversations; a team member can view the full message history (including AI turns), take over, reply, and then return the conversation to the AI.
6. The chat sidebar displays the patient's visit history, open treatments, total spend, and tags — visible to the clinic team member before they type their first reply.

**Plans**: TBD

---

### Phase 5: Appointment Confirmation & ROI Dashboard
**Goal**: The product completes the revenue-recovery loop — confirming appointments to cut no-shows and presenting the clinic owner with a clear R$ figure that proves the system's value.
**Depends on**: Phase 4
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, DASH-01, DASH-02, DASH-03, DASH-04
**UI hint**: yes

### Success Criteria (what must be TRUE)
1. For every appointment in the system, a confirmation message is sent automatically 48 hours before; a reminder is sent 3 hours before if the appointment was confirmed; both jobs are scheduled as delayed BullMQ tasks with no manual trigger.
2. When a patient replies that they cannot attend, the AI offers alternative time slots for rebooking without human intervention.
3. A missed appointment (no-show) is recorded with status `no_show` and triggers a recovery message the following day.
4. The dashboard prominently displays the estimated R$ recovered in the current month (confirmed appointments × clinic ticket average), a per-campaign funnel (sent → delivered → read → replied → booked), and a month-over-month comparison — all visible without any configuration after the first campaign runs.
5. A user can export the monthly report as a PDF suitable for sharing with a business partner or accountant.

**Plans**: TBD

---

### Phase 6: Onboarding & Billing
**Goal**: A new clinic can discover, subscribe, activate, and reach first value (first campaign sent) within 7 days — without any technical help from the ClínicaFlow team.
**Depends on**: Phase 5
**Requirements**: ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04
**UI hint**: yes

### Success Criteria (what must be TRUE)
1. A new signup enters a 14-day trial without entering payment details; an automated email is sent 3 days before trial expiry with a clear call to subscribe.
2. The clinic owner sees a gamified activation checklist on first login (connect WhatsApp → import base → configure AI → send first campaign) with a visible progress bar; completing each step unlocks the next.
3. A user can subscribe to any plan (Starter / Pro / Multi) via Pagar.me using a recurring credit card or Pix — the subscription is activated and the system reflects the new plan limits within 5 minutes of payment confirmation.
4. If a tenant has not completed the onboarding checklist by Day 1, Day 3, or Day 7, an activation email is triggered automatically with a contextual nudge matching their current step.

**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 6/10 | In progress | - |
| 2. Data & Configuration | 0/? | Not started | - |
| 3. Campaign Engine | 0/? | Not started | - |
| 4. AI Conversation & Inbox | 0/? | Not started | - |
| 5. Appointment Confirmation & ROI Dashboard | 0/? | Not started | - |
| 6. Onboarding & Billing | 0/? | Not started | - |
