# Research Summary: ClínicaFlow

**Pesquisado:** 2026-05-23
**Confiança geral:** MÉDIA-ALTA (stack alta / features e regulatório médio)

---

## TL;DR

- **Fundação antes de tudo:** Multi-tenancy via Prisma `$extends` + `AsyncLocalStorage` e `maxmemory-policy noeviction` no Redis devem estar corretos desde o primeiro commit. Retroativo com dados de saúde em produção é impossível.
- **WhatsApp ban é o risco de negócio mais imediato:** Typing indicator, delay aleatório (3-15s), variação por IA e aquecimento gradual não são "melhorias" — são pré-requisito para sobrevivência do produto.
- **Stack precisa de dois ajustes vs PROJECT.md:** React 19 (não 18) e Prisma 7 (não implícito anterior). Mais: `cuid` deprecated → usar `@paralleldrive/cuid2`, `limiter.groupKey` removido no BullMQ v3 OSS, Tailwind v4 é CSS-first (sem `tailwind.config.js`).
- **Caminho crítico é estritamente linear:** auth → CSV import → segmentação → AI config → disparo com rate limiting → IA conversacional + guardrails → confirmação → ROI dashboard. Cada camada depende da anterior.
- **Nicho não endereçado:** Nenhum competidor cobre "recuperação ativa de base de pacientes de clínica PME via WhatsApp + IA com ROI em R$." A janela está aberta.

---

## Stack Decisions

**Versões confirmadas (npm, 2026-05-23):**

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime | Node.js | 20 LTS |
| Backend | Fastify | 5.8.5 |
| ORM | Prisma + @prisma/client | 7.8.0 |
| Banco | PostgreSQL | 16 |
| Filas | BullMQ | 5.77.1 |
| WhatsApp | Evolution API | Docker (sem npm package) |
| IA | @anthropic-ai/sdk | 0.98.0 |
| Validação | Zod | 4.4.3 |
| Monorepo | pnpm 9 + Turborepo 2.9.14 | — |
| Frontend | **React 19.2.6** | ← atualizar PROJECT.md |
| Build | Vite | 8.0.14 |
| CSS | **Tailwind 4.3.0** | ← config CSS-first, sem tailwind.config.js |
| IDs | @paralleldrive/cuid2 | 3.3.0 (cuid original deprecated 2022) |
| Pagamentos | pagarme | 4.35.2 |
| Email | resend | 6.12.3 |
| Logs/Erros | Pino (bundled) + @sentry/node | 10.53.1 |
| Datas | date-fns 4.x + date-fns-tz 3.x | — |
| CSV | csv-parse | 6.2.1 |

**Divergências críticas do PROJECT.md:**
1. `React 18` → `React 19.2.6` (latest stable, sem breaking changes relevantes para SPA)
2. `Prisma 6/5` → `Prisma 7.8.0` (começar na versão atual evita migração forçada em 6-9 meses)
3. `cuid()` → `@paralleldrive/cuid2` (cuid deprecated desde 2022)
4. `evolution-api` npm package não existe (deletado dez/2023) → HTTP REST direto ao container Docker
5. `BullMQ limiter.groupKey` removido na v3 OSS → Redis sliding window manual por número WhatsApp
6. `Tailwind v3 config` → reescrever CSS-first (qualquer config copiada do CRM do Verê precisa ser migrada)

---

## Table Stakes

Features sem as quais o cliente não ativa ou cancela em 30 dias:

**Importação e base:**
- Wizard CSV com mapeamento de colunas + preview (colunas inconsistentes por software: "Celular" vs "Tel. Celular" vs "FONE CEL")
- Deduplicação por telefone E.164 (15-40% de duplicatas em bases reais)
- Normalização robusta: encoding Windows-1252/UTF-8, BOM Excel, telefones em 20+ formatos brasileiros
- Relatório de importação com CSV de erros baixável
- Upload incremental sem sobrescrever dados de pacientes já ativos

**Campanhas:**
- Segmentos pré-configurados prontos no dia 1 (inativos 6/12m, aniversariantes, tratamento em aberto)
- Preview do tamanho do segmento antes de disparar
- Templates de campanha prontos para odonto (dentista não escreve copy)
- Janela de disparo 9h-20h, sem domingo, sem feriado — o sistema protege o cliente por padrão
- Variação de texto por IA por mensagem (sem variação = ban)
- Pausa e cancelamento em andamento

**IA conversacional:**
- Resposta em <30s após mensagem do paciente
- FAQ da clínica como base de resposta (sem FAQ, IA inventa)
- Guardrail clínico em código pós-resposta (inviolável por prompt)
- Transferência para humano com histórico completo visível
- Indicador visual: conversa com IA vs aguardando humano

**Confirmação:**
- Confirmação automática 48h antes (20-35% redução de no-show por si só)
- Lembrete 3h antes

**Dashboard:**
- R$ recuperado estimado em destaque (agendamentos × ticket médio)
- Funil de campanha: enviadas → entregues → lidas → respondidas → agendadas
- Comparativo mensal

---

## Key Differentiators

- **ROI em R$ demonstrável:** "Você pagou R$397 e recuperou R$4.200 estimados" + export PDF mensal. Concorrentes mostram métricas de engajamento, não R$.
- **IA com tom da clínica:** editor de tom com preview em tempo real. Concorrentes usam tom genérico fixo.
- **Follow-up automático 3 e 7 dias:** dobra taxa de resposta vs disparo único.
- **Alerta de tratamento em aberto:** urgência demonstrável que motiva ação imediata.
- **Opt-in/opt-out rastreados para LGPD art. 11:** concorrentes voltados para varejo não pensam em dados de saúde.

---

## Critical Pitfalls

Top 5 por impacto × probabilidade:

1. **Multi-tenant data leak** — Crítico + LGPD art. 11. Uma query sem `tenant_id` expõe dados de saúde. Impossível de corrigir retroativamente com dados em produção. Tratar na Fase 1 como infraestrutura, não feature.

2. **WhatsApp ban permanente** — Crítico. Número banido = produto parado sem recuperação rápida. Prevenção: typing indicator antes de cada mensagem, delay aleatório 3-15s (nunca fixo), 20/min (não 30), variação verificada, aquecimento 7 dias antes de campanha em massa.

3. **IA hallucination em saúde** — Crítico. Um caso de diagnóstico via IA = problema com CFO/CFM. Prompt sozinho não é suficiente. Prevenção: filtro pós-resposta em código com regex inviolável, 50 prompts adversariais na suite de testes, limite de 8 turnos antes de handoff.

4. **Redis sem `noeviction`** — Alto. Redis com `allkeys-lru` (padrão) evicta keys do BullMQ silenciosamente. Campanhas reprocessadas = mensagem duplicada = risco de ban. `maxmemory-policy noeviction` verificado antes de qualquer deploy.

5. **CSV importado corrompido silenciosamente** — Médio-alto. Bases reais chegam com Windows-1252, BOM Excel, telefones em 20 formatos, 15-40% duplicatas. Sem tratamento, campanhas disparam para números inválidos ou múltiplas vezes para o mesmo paciente.

---

## Architecture Decisions

**Multi-tenancy via Prisma `$extends` + `AsyncLocalStorage`**
Contexto de tenant via `AsyncLocalStorage` nativo. Extension intercepta `$allModels.$allOperations` injetando `tenantId` + `deletedAt: null`. Workers BullMQ chamam `withTenant(job.data.tenantId, fn)` explicitamente. Raw SQL precisa de anotação manual + lint rule.

**BullMQ rate limiting WhatsApp via Redis sliding window**
`limiter.groupKey` removido na v3 OSS. Solução: limiter global no worker como safety net + Redis `INCR` sliding window por número dentro do processor. Quando limite atingido: `worker.rateLimit(waitMs)` + `throw Worker.RateLimitError()`.

**Webhook: respond-first, process async**
Evolution API espera 200 em <2s. Rota retorna 200 após HMAC, enfileira async. `addContentTypeParser` preserva `rawBody` para verificação HMAC. Idempotência por `messageId` via Redis `SETNX`.

**Worker separado do API**
`apps/worker` processo Node separado de `apps/api`. Scaling independente, crash não derruba API.

**PgBouncer em transaction mode**
`?pgbouncer=true&connection_limit=1` na DATABASE_URL. Não Prisma Accelerate (vendor lock-in).

---

## Build Order

Dependências concretas para o roadmapper:

```
Fase 1 — Fundação (bloqueante para tudo)
  ├── Monorepo scaffold: Turborepo + pnpm workspaces, tsconfig, ESLint/Prettier
  ├── packages/db: Prisma schema, migrations, extension tenant + soft delete + índices
  ├── packages/shared: Zod schemas, AppError, tipos, constantes de filas
  ├── Auth: JWT RS256 + refresh token httpOnly cookie
  ├── Tenant middleware: AsyncLocalStorage + Prisma extension + teste de isolamento em CI
  ├── Redis + BullMQ: connection factory, 5 filas, DLQ, worker harness
  └── Evolution API wrapper: packages/whatsapp HTTP client tipado + HMAC

Fase 2 — Dados e Configuração (depende da Fase 1)
  ├── CSV importer: streaming, normalizePhone(), wizard, deduplicação, preview, relatório
  ├── Patient model completo + segmentação automática
  └── AI config CRUD por tenant: FAQ, tom, horário, palavras-gatilho

Fase 3 — Campanha e Disparo (depende da Fase 1+2)
  ├── packages/ai: Claude client, guardrails, FAQ cache, buildSystemPrompt()
  ├── Campaign editor: templates, variáveis, preview de segmento
  ├── campaign-dispatch worker: rate limit, typing indicator, delay, janela de disparo
  └── Webhook handler: Evolution → queue, idempotência

Fase 4 — IA Conversacional (depende da Fase 3)
  ├── ai-conversation worker: Haiku triagem → Sonnet conversa, 8 turnos, idle 24h
  ├── Guardrails: filtro pós-resposta, adversarial test suite, handoff para humano
  └── Inbox: conversas com indicador IA/humano

Fase 5 — Ciclo Completo (depende da Fase 4)
  ├── appointment-confirm worker: delayed jobs 48h/3h, no-show
  ├── Dashboard ROI: R$ recuperado, funil, comparativo mensal
  └── Export PDF mensal

Fase 6 — Onboarding e GTM
  ├── Billing: Pagar.me subscription + webhooks
  ├── Checklist de ativação gamificado
  └── Trial 14 dias + CS ativo no Dia 7/14
```

**Paralelo possível:**
- `packages/ai` pode começar junto com Fase 2 (independente de Evolution)
- `apps/web` pode construir componentes com API mockada desde Fase 2
- `packages/billing` pode ser desenvolvido durante Fase 3-4

---

## Open Questions

| Questão | Impacto | Quando resolver |
|---------|---------|-----------------|
| Nome final + domínio | CORS, cookies, email sender | Antes Fase 6 |
| Pagar.me SDK vs REST direto para subscription | Design da Fase 6 | Antes Fase 6 |
| Lista de feriados nacionais: hardcoded ou API | Afeta janela de disparo | Antes Fase 3 |
| Alocação de instâncias Evolution no pool Starter | Arquitetura de pool | Antes Fase 3 |
| Ticket médio default por tenant | Cálculo de ROI | Antes Fase 5 |
| DPO/Encarregado LGPD | Obrigatório para dados sensíveis | Antes Fase 6 |
| Evolution API: versão Docker + algoritmo HMAC | Wrapper correto | Antes Fase 1 |

---

*Research completed: 2026-05-23*
