# ClínicaFlow

## What This Is

ClínicaFlow é um SaaS de WhatsApp + IA que recupera pacientes inativos, reduz no-show e automatiza recall em clínicas de odontologia (MVP), com expansão futura para estética, fisioterapia e nutrição. O produto importa a base de pacientes existente, segmenta automaticamente, dispara campanhas personalizadas por IA e conversa com os pacientes até agendar — mostrando o ROI em R$ recuperados no painel.

**Quem usa:** Dono ou gerente de clínica odontológica pequena/média (1-3 unidades, 800-5000 pacientes, faturamento R$30k-300k/mês). Não é técnico, compra por ROI claro, paga via Pix ou cartão recorrente.

## Core Value

Transformar a base de pacientes inativos em faturamento recorrente de forma automática — o cliente vê em R$ quanto recuperou no mês, e esse número paga o SaaS várias vezes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Importação de base de pacientes via CSV/Excel com wizard de mapeamento de colunas
- [ ] Segmentação automática de pacientes (inativos por período, aniversariantes, tratamento em aberto, recall)
- [ ] Editor visual de campanhas com templates e variáveis dinâmicas
- [ ] Disparo via WhatsApp com IA personalizando cada mensagem e respeitando rate limits
- [ ] IA conversacional que responde, qualifica intenção e agenda consultas
- [ ] Transferência para humano com critérios configuráveis (palavras-gatilho, emergências)
- [ ] Confirmação automática de consultas (48h e 3h antes) com reagendamento
- [ ] Dashboard de ROI em R$ recuperado com comparativo mensal
- [ ] Auth multi-tenant seguro com isolamento total por clínica
- [ ] Onboarding funcional em <7 dias sem necessidade de TI
- [ ] Guardrails de IA: nunca diagnóstico, nunca promessa de resultado
- [ ] Configuração de IA por clínica: tom, FAQ, horário de atendimento, palavras-gatilho

### Out of Scope

- Prontuário eletrônico — regulação CFO/CFM, fora do escopo de recuperação de pacientes
- Teleconsulta — regulado pelo CFM
- Captação de paciente novo via ads — foco é base existente
- App mobile nativo — web responsivo suficiente na fase atual
- Multi-idioma — só PT-BR
- Integração nativa com Clinicorp/EasyDental (MVP) — CSV primeiro, API nativa é fase 2
- Hospitais ou redes grandes (>10 unidades)
- Pagamento online de consulta — regulado no contexto de saúde
- Módulo financeiro/cobrança

## Context

**Stack decidida (não negociar sem discussão):**
- Backend: Node.js 20 + Fastify
- DB: PostgreSQL 16, multi-tenant row-level com `tenant_id` em toda tabela
- Fila: Redis 7 + BullMQ (5 filas: campaign-dispatch, ai-conversation, appointment-confirm, recall-scheduler, webhook-evolution)
- WhatsApp: Evolution API (pool compartilhado Starter, dedicado Pro+)
- IA: Claude Haiku (triagem/reescrita), Claude Sonnet (conversas)
- Frontend: React 18 + Vite + TypeScript + Tailwind + shadcn/ui
- Auth: JWT + refresh token (httpOnly cookie)
- Pagamento: Pagar.me (Pix + cartão recorrente)
- Hosting: Hetzner

**Dados sensíveis (LGPD art. 11):**
- Nunca logar conteúdo de mensagens em texto puro
- Nunca armazenar PII em cache externo sem TTL curto
- Soft delete obrigatório; audit log em toda operação de paciente

**ICP primário:** Odontologia. Dentista-gestor, 800-5000 pacientes, decide por ROI, paga Pix.

**Código de referência:** CRM do Verê (projeto anterior do Paulo) — reaproveitamento conceitual de: auth multi-tenant, wrapper Evolution API, editor de prompt IA, BullMQ setup, webhook handler. Não copiar arquivo por arquivo — refatorar limpo.

## Constraints

- **LGPD**: Dados de saúde são dados sensíveis — isolamento por tenant é inegociável; qualquer query sem `tenant_id` é bug crítico
- **WhatsApp**: Rate limits são lei — nunca ultrapassar (max 30 msgs/min, max 1000/dia por número); janela 9h-20h, sem domingo, sem feriado nacional
- **IA Guardrails**: A IA nunca dá diagnóstico, opinião clínica ou prescrição — guardrail em código, não só em prompt
- **Tech**: TypeScript strict mode, sem `any`, sem ORM pesado além de Prisma, sem MongoDB pra dados de paciente
- **Timeline**: MVP em ~90 dias; primeiro piloto em 30 dias
- **Custo IA**: Meta <R$10/cliente/mês no plano Starter
- **Onboarding**: Funcional em <7 dias sem TI do cliente

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Row-level multi-tenancy (não schema-per-tenant) | Simplicidade operacional até 200 clientes; migrações únicas, backup único | — Pending |
| Claude como IA padrão (não OpenAI) | Custo menor, melhor qualidade PT-BR, LGPD mais favorável | — Pending |
| Evolution API para WhatsApp | Já dominado no CRM do Verê, custo menor que Cloud API oficial | — Pending |
| MVP só odontologia | Foco de pitch, templates específicos, clareza de posicionamento | — Pending |
| Pagar.me (não Stripe) | Pix recorrente nativo, UX brasileira | — Pending |
| CSV-first para importação (não integração nativa) | Valida com primeiros clientes antes de investir em APIs específicas | — Pending |
| IDs: cuid() | Não sequencial (sem enumeration attack), não UUID v4 (legibilidade) | — Pending |
| Dinheiro em centavos (int) | Evita erro de ponto flutuante; padrão da indústria | — Pending |

## Evolution

Este documento evolui a cada transição de fase e milestone.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope com motivo
2. Requirements validados? → Mover para Validated com referência de fase
3. Novos requirements emergiram? → Adicionar em Active
4. Decisões a logar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se derivou

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditar Out of Scope — razões ainda válidas?
4. Atualizar Context com estado atual

---
*Last updated: 2026-05-23 after initialization*
