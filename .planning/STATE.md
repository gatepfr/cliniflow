# Project State: ClínicaFlow

**Last updated:** 2026-05-24
**Current phase:** Phase 1 — Foundation (Executing — Wave 2)
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
**Plan:** 01-03 complete — executing Plan 01-04 next (10 plans, 4 waves)
**Status:** Executing — Wave 2
**Progress:** ░░░░░░░░░░ 0/6 phases (Phase 1: 3/10 plans complete)

---

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Foundation | **In progress** — 3/10 plans complete | Plan 01-03 done 2026-05-24 |
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
| Plans complete (Phase 1) | 10 | 3 |
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
| 2026-05-24 | Redis `noeviction` set via docker-compose command | Prevents silent BullMQ job eviction; alternative to redis.conf mount — simpler for dev |
| 2026-05-24 | Evolution API uses `evolution_api` schema in same postgres container | Avoids fourth container; schema separation via connection string `?schema=evolution_api` |
| 2026-05-24 | LOG_LEVEL ERROR for evolution-api in docker-compose | Reduces dev noise; INFO is extremely verbose for Evolution API container |
| 2026-05-23 | Redis `maxmemory-policy noeviction` | Default `allkeys-lru` silently evicts BullMQ keys → duplicate sends → ban risk |
| 2026-05-23 | 20 msgs/min WhatsApp limit (not 30) | Research lowered safe rate vs PROJECT.md to reduce ban risk |
| 2026-05-24 | Prisma 7 datasource url in prisma.config.ts (not schema) | Prisma 7.8.0 breaking change — url removed from schema.prisma datasource block |
| 2026-05-24 | docker-compose postgres port 5434 (not 5432) | Ports 5432 and 5433 already in use by local PostgreSQL instances on dev machine |
| 2026-05-24 | baseClient for audit log writes (not extended prisma) | Prevents infinite recursion through $allOperations extension (RESEARCH.md Pitfall 5) |

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

**Last session:** 2026-05-24 — Plan 01-03 executed. Database layer complete: Prisma schema (12 models), AsyncLocalStorage tenant context, extended Prisma client with $allOperations tenant isolation + audit log, migration init applied to PostgreSQL (port 5434).

**Next action:** Continue Phase 1 execution — Plan 01-04 (packages/shared schemas — Zod validation schemas)

**Context to reload next session:**
- `.planning/phases/01-foundation/01-CONTEXT.md` — decisões capturadas para Fase 1
- `.planning/PROJECT.md` — core value, constraints, stack decisions
- `.planning/ROADMAP.md` — 6-phase structure and success criteria
- `.planning/REQUIREMENTS.md` — 54 v1 requirements with traceability
- `CLAUDE.md` — project conventions (already loaded by default)
