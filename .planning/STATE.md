# Project State: ClínicaFlow

**Last updated:** 2026-05-24
**Current phase:** Phase 1 — Foundation (Executing — Wave 1)
**Completed phases:** None

---

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-23)

**Core value:** Transformar a base de pacientes inativos em faturamento recorrente de forma automática — o cliente vê em R$ quanto recuperou no mês, e esse número paga o SaaS várias vezes.

**Current focus:** Phase 1 — Foundation

**Key constraint:** Multi-tenant isolation (LGPD art. 11) is non-negotiable. Any query without `tenant_id` is a critical bug. WhatsApp ban risk is the most immediate business threat.

---

## Current Position

**Phase:** 1
**Plan:** 01-01 complete — executing Plan 01-02 next (10 plans, 4 waves)
**Status:** Executing — Wave 1
**Progress:** ░░░░░░░░░░ 0/6 phases (Phase 1: 1/10 plans complete)

---

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Foundation | **In progress** — 1/10 plans complete | Plan 01-01 done 2026-05-24 |
| 2 | Data & Configuration | Not started | Requires Phase 1 complete |
| 3 | Campaign Engine | Not started | Requires Phase 2 complete |
| 4 | AI Conversation & Inbox | Not started | Requires Phase 3 webhook infra |
| 5 | Appointment Confirmation & ROI Dashboard | Not started | Requires Phase 4 conversation loop |
| 6 | Onboarding & Billing | Not started | Requires full product working |

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases complete | 6 | 0 |
| Plans complete (Phase 1) | 10 | 1 |
| Requirements mapped | 54 | 54 |
| Tests passing | — | — |
| AI cost per tenant/month | <R$10 | — |

---

## Active Blockers

None

---

## Accumulated Context

### Key Decisions Logged

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-24 | pnpm.onlyBuiltDependencies for prisma/esbuild | pnpm 10.x requires explicit approval for build scripts; required for Prisma engine binary and esbuild native compile |
| 2026-05-24 | apps/web tsconfig standalone (not extending base) | NodeNext incompatible with Vite Bundler module resolution; web needs ESNext + Bundler + DOM lib |
| 2026-05-23 | React 19 (not 18) | Latest stable confirmed by research |
| 2026-05-23 | Prisma 7.8.0 | Start on current version; avoid forced migration in 6-9 months |
| 2026-05-23 | `@paralleldrive/cuid2` (not `cuid`) | `cuid` deprecated since 2022 |
| 2026-05-23 | Evolution API via HTTP REST to Docker container | npm package deleted Dec 2023 |
| 2026-05-23 | BullMQ rate limiting via Redis sliding window | `limiter.groupKey` removed in v3 OSS |
| 2026-05-23 | Tailwind v4 CSS-first config | No `tailwind.config.js` — rewrite any v3 config copied from Verê CRM |
| 2026-05-23 | Redis `maxmemory-policy noeviction` | Default `allkeys-lru` silently evicts BullMQ keys → duplicate sends → ban risk |
| 2026-05-23 | 20 msgs/min WhatsApp limit (not 30) | Research lowered safe rate vs PROJECT.md to reduce ban risk |

### Open Questions (from Research)

| Question | Impact | Resolve Before |
|----------|--------|----------------|
| Nome final + domínio | CORS, cookies, email sender | Phase 6 |
| Pagar.me SDK vs REST direto para subscription | Billing design | Phase 6 |
| Lista de feriados nacionais: hardcoded ou API | Campaign dispatch window | Phase 3 |
| Alocação de instâncias Evolution no pool Starter | WhatsApp pool architecture | Phase 3 |
| Ticket médio default por tenant | ROI calculation | Phase 5 |
| DPO/Encarregado LGPD | Obrigatório para dados sensíveis | Phase 6 |
| Evolution API: versão Docker + algoritmo HMAC | Wrapper implementation | Plan 01-07 |

### Todos

- [ ] Confirm Evolution API Docker version and HMAC algorithm before Phase 1 wrapper implementation
- [ ] Decide national holidays source (hardcoded list vs external API) before Phase 3 dispatch worker
- [ ] Set tenant default ticket average strategy before Phase 5 ROI dashboard

### Critical Pitfalls (from Research)

1. **Multi-tenant data leak** — One query without `tenant_id` exposes health data. Impossible to fix retroactively in production. Phase 1 must treat this as infrastructure, not a feature.
2. **WhatsApp ban** — Number banned = product down with no quick recovery. Typing indicator + random 3-15 s delay + AI variation + 20/min limit + 7-day warm-up are all mandatory, not optional.
3. **AI hallucination in healthcare** — Post-response code filter with regex is non-negotiable. Prompt alone is insufficient. 50 adversarial prompts in test suite.
4. **Redis without noeviction** — Silent BullMQ key eviction → campaign reprocessing → duplicate messages → ban.
5. **Corrupted CSV import** — Real bases arrive with Windows-1252, BOM, 20 phone formats, 15-40% duplicates. Silent corruption means campaigns fire to invalid numbers or multiple times to the same patient.

---

## Session Continuity

**Last session:** 2026-05-24 — Plan 01-01 executed. Monorepo skeleton complete, pnpm install clean.

**Next action:** Continue Phase 1 execution — Plan 01-02 (docker-compose: PostgreSQL 16, Redis 7, Evolution API)

**Context to reload next session:**
- `.planning/phases/01-foundation/01-CONTEXT.md` — decisões capturadas para Fase 1
- `.planning/PROJECT.md` — core value, constraints, stack decisions
- `.planning/ROADMAP.md` — 6-phase structure and success criteria
- `.planning/REQUIREMENTS.md` — 54 v1 requirements with traceability
- `CLAUDE.md` — project conventions (already loaded by default)
