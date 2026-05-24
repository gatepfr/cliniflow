# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 01-foundation
**Areas discussed:** Refresh tokens, Escopo do wrapper WhatsApp, Topologia do worker

---

## Refresh Tokens

| Option | Description | Selected |
|--------|-------------|----------|
| Redis (TTL 30 dias) | Rápido, expira automático. Sessões perdidas se Redis reiniciar sem persistência. | ✓ |
| Tabela no banco (refresh_token) | Persistente, auditável, permite ver sessões ativas. Query a cada refresh. | |
| Redis + cache de revogação no banco | Velocidade + audit trail combinados. Mais complexo. | |

**Rotação:**

| Option | Description | Selected |
|--------|-------------|----------|
| One-time use | Cada uso invalida o token anterior. Token roubado detectado. | ✓ |
| Sliding window | TTL renova a cada uso. Token roubado pode ficar válido indefinidamente. | |

**Multi-dispositivo:**

| Option | Description | Selected |
|--------|-------------|----------|
| Múltiplos tokens por usuário | Cada login é independente. Logout desconecta só aquele dispositivo. | ✓ |
| Sessão única | Novo login invalida sessões anteriores. | |

**User's choice:** Redis, one-time use, múltiplos dispositivos
**Notes:** Nenhuma observação adicional além da seleção padrão.

---

## Escopo do Wrapper WhatsApp

| Option | Description | Selected |
|--------|-------------|----------|
| Wrapper funcional + número de teste | Wrapper completo testado com WhatsApp real. Conectividade comprovada. | ✓ |
| Esqueleto tipado sem conexão real | Tipos e interface prontos, sem teste com número real. Risco de descobrir problemas tarde. | |
| Wrapper + Docker Compose local | Funcional + docker-compose.yml com toda a infra de dev. | |

**Todo pendente (versão Docker + HMAC):**

| Option | Description | Selected |
|--------|-------------|----------|
| Pesquisador da Fase 1 resolve | Agente de pesquisa descobre versão e HMAC antes do planejamento. | ✓ |
| Informar agora | Paulo informa versão e algoritmo manualmente. | |

**Docker Compose:**

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, Docker Compose completo | PostgreSQL + Redis + Evolution API em docker-compose.yml. | ✓ |
| Não, instalação manual | Dev instala Postgres e Redis localmente. | |

**User's choice:** Wrapper funcional + número de teste + Docker Compose completo. Pesquisador resolve versão/HMAC.
**Notes:** Nenhuma observação adicional.

---

## Topologia do Worker BullMQ

| Option | Description | Selected |
|--------|-------------|----------|
| Um processo worker, 5 filas | 1 Dockerfile, 1 restart, simples. Suficiente para MVP. | ✓ |
| Worker separado por fila | Escala independente mas 5x mais complexidade. Overkill para MVP. | |

**Concorrência:**

| Option | Description | Selected |
|--------|-------------|----------|
| Claude decide por fila | Configurado baseado no rate limit e natureza de cada fila. | ✓ |
| Flat 5 para todas | Simples mas ineficiente. | |

**Retry / DLQ:**

| Option | Description | Selected |
|--------|-------------|----------|
| Exponencial + DLQ após 3 tentativas | Backoff 1s→5s→30s, DLQ para inspeção. Sentry para erros. | ✓ |
| Exponencial + descarta após 5 tentativas | Sem DLQ, perde rastreabilidade. | |

**User's choice:** Um processo, Claude decide concorrência, exponencial + DLQ após 3 tentativas.
**Notes:** Nenhuma observação adicional.

---

## Claude's Discretion

- **Camada de audit log:** Prisma `$extends` para interceptar writes em tabelas sensíveis (consistente com middleware de tenant). Não selecionada pelo usuário para discussão — Claude decide a abordagem.
- **Concorrência por fila:** campaign-dispatch:5, ai-conversation:10, appointment-confirm:3, recall-scheduler:1, webhook-evolution:20.
- **TTL access token:** 15 minutos, configurável via env var.

## Deferred Ideas

- Multi-worker por fila (revisar após 200 tenants)
- Bull Board para monitorar filas
- Rota admin para DLQ
