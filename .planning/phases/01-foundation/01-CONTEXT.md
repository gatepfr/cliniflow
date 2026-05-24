# Phase 1: Foundation - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo funcional, isolamento multi-tenant comprovado em CI, auth com JWT+refresh token, 5 filas BullMQ operacionais, wrapper Evolution API testado com número real — tudo rodando com `pnpm dev` e `docker compose up`. Nenhuma query vaza dados entre tenants.

Fora do escopo desta fase: UI além de scaffolding básico do frontend, segmentação de pacientes, disparo de campanhas, IA conversacional.

</domain>

<decisions>
## Implementation Decisions

### Auth & Session Management

- **D-01:** Refresh tokens armazenados no Redis com TTL de 30 dias (não em tabela de banco).
- **D-02:** Rotação one-time use — cada uso do refresh token emite um novo token e invalida o anterior. Token roubado detectado quando usuário legítimo tenta usar o antigo.
- **D-03:** Múltiplos dispositivos suportados — cada login gera um refresh token independente. Logout desconecta apenas aquele dispositivo. Redis key por token (não por usuário).
- **D-04:** JWT de acesso com TTL curto (15 minutos). Refresh token com TTL 30 dias. Redis `SET token:{uuid} {userId}:{tenantId} EX 2592000`.

### WhatsApp Wrapper

- **D-05:** Fase 1 entrega wrapper funcional testado com número WhatsApp real de desenvolvimento — não apenas esqueleto. Conectividade comprovada é critério de aceite.
- **D-06:** Incluir `docker-compose.yml` com PostgreSQL 16, Redis 7 e container Evolution API pré-configurado. `docker compose up` deve subir tudo sem configuração manual.
- **D-07:** Versão Docker da Evolution API e algoritmo HMAC exato a ser confirmado pelo pesquisador da Fase 1 antes do planejamento. Não hardcodar antes dessa pesquisa.

### Worker BullMQ

- **D-08:** Um único processo worker (`apps/worker`) gerencia todas as 5 filas. Um Dockerfile, um deploy, um restart. Suficiente para MVP.
- **D-09:** Concorrência por fila fica a critério de Claude (ver "Claude's Discretion" abaixo).
- **D-10:** Política de retry: backoff exponencial (1s → 5s → 30s), máximo 3 tentativas. Após 3 falhas, job vai para Dead Letter Queue (fila separada no Redis para inspeção manual). Erro logado no Sentry com job ID e stack.

### Claude's Discretion

- **Camada de audit log:** Usar Prisma `$extends` para interceptar `create`, `update` e `delete` em tabelas com dados de paciente (`patient`, `visit`, `treatment`, `conversation`, `chat_message`, `appointment`). Consistente com o middleware de tenant que já usa `$extends`. Captura automaticamente todas as escritas, inclusive vindas dos workers — sem necessidade de chamadas manuais nos handlers.
- **Concorrência por fila:** `campaign-dispatch: 5` (limitado pelo rate limit WA), `ai-conversation: 10` (I/O-bound, aguarda Claude API), `appointment-confirm: 3`, `recall-scheduler: 1` (job diário), `webhook-evolution: 20` (resposta rápida, processamento leve).
- **TTL dos access tokens:** 15 minutos. Configurável via env var `JWT_ACCESS_TTL`.

</decisions>

<canonical_refs>
## Canonical References

**Agentes downstream DEVEM ler estes arquivos antes de planejar ou implementar.**

### Projeto e Requisitos
- `CLAUDE.md` — Convenções do projeto: stack, multi-tenancy, LGPD, rate limits, guardrails de IA, naming, testing
- `.planning/PROJECT.md` — Core value, decisões-chave, constraints inegociáveis
- `.planning/REQUIREMENTS.md` — 54 requisitos v1 com rastreabilidade; FOUND-01 a FOUND-06 são desta fase
- `.planning/ROADMAP.md` — Goals e critérios de aceite da Fase 1 (5 critérios críticos)

### PRD
- `PRD-ClinicaFlow.md` — Documento de produto completo; seções de auth, multi-tenant e WhatsApp são relevantes para Fase 1

### Pesquisa a Realizar (antes do planejamento)
- Versão estável atual da Evolution API (imagem Docker: `atendai/evolution-api:vX.Y.Z` ou equivalente)
- Algoritmo HMAC do webhook Evolution API (SHA256? verificar header e algoritmo exatos)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum código existente — projeto recém-iniciado. Fase 1 cria toda a base.

### Established Patterns
- Sem padrões estabelecidos no código ainda. Fase 1 define os padrões que as fases seguintes seguem.

### Integration Points
- `packages/db` → schema Prisma com `$extends` para tenant filter + audit log
- `packages/shared` → tipos Zod, `AppError`, constantes compartilhadas
- `apps/api` → rotas Fastify, middleware de tenant via `AsyncLocalStorage`
- `apps/worker` → processo único BullMQ, importa workers de cada fila
- `packages/whatsapp` → cliente HTTP Evolution API, verifica HMAC, exporta `sendMessage` e handler de webhook

### Critical Constraints (from Research)
- Redis `maxmemory-policy noeviction` obrigatório — evicção silenciosa de chaves BullMQ causa reprocessamento → mensagens duplicadas → ban WA
- Evolution API npm package foi deletado em dez/2023 — usar HTTP REST direto para container Docker
- `cuid` (sem v2) está deprecated desde 2022 — usar `@paralleldrive/cuid2`
- Tailwind v4 não tem `tailwind.config.js` — CSS-first config
- BullMQ v3+ OSS: `limiter.groupKey` foi removido — rate limiting via Redis sliding window

</code_context>

<specifics>
## Specific Ideas

- Isolamento multi-tenant via `AsyncLocalStorage` + `Prisma.$extends` é a abordagem escolhida (FOUND-02). O middleware Fastify injeta `tenantId` no contexto antes de qualquer handler. Qualquer query sem contexto ativo deve falhar — não silenciar.
- Teste CI de isolamento (FOUND-03): um teste deve tentar executar query Prisma sem contexto `AsyncLocalStorage` ativo e o middleware deve rejeitar **antes** da query chegar ao banco. O CI bloqueia merge se esse teste falhar.
- Auth: `/api/auth/signup`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` como rotas iniciais. Refresh via httpOnly cookie, access token no corpo da resposta.

</specifics>

<deferred>
## Deferred Ideas

- Topologia multi-worker por fila (worker separado por fila) — desnecessário para MVP, revisar quando ultrapassar 200 tenants ou precisar escalar campaign-dispatch independentemente.
- Dashboard de jobs BullMQ (Bull Board) — útil mas não é critério de aceite da Fase 1. Pode ser adicionado como rota interna no worker.
- Rota de admin para inspecionar DLQ — fora do escopo de Fase 1, entra na operação.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-05-23*
