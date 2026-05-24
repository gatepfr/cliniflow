# CLAUDE.md — ClínicaFlow

> Arquivo de contexto persistente pro Claude Code. Leia INTEIRO antes de qualquer tarefa neste repositório. Atualize este arquivo sempre que decisões arquiteturais mudarem.

---

## 1. O que é este projeto

**ClínicaFlow** é um SaaS multi-tenant de WhatsApp + IA para clínicas (odontologia primeiro, depois estética/fisio/nutrição). O produto:

1. Importa base de pacientes do software de gestão atual do cliente
2. Segmenta automaticamente (inativos, aniversariantes, recall, tratamento em aberto)
3. Dispara campanhas de WhatsApp com IA personalizando o tom
4. Conversa, qualifica e agenda via IA quando o paciente responde
5. Confirma consultas e reduz no-show
6. Mostra ROI em R$ recuperados no dashboard

**Métrica de sucesso principal do produto:** R$ de faturamento recuperado/mês pelo cliente. É isso que mantém a mensalidade.

**Documento de referência:** `PRD-ClinicaFlow.md` na raiz do repositório. Em conflito entre código existente e PRD, PERGUNTE antes de mudar.

---

## 2. Contexto crítico de negócio que afeta código

### 2.1 Dados de saúde são sensíveis (LGPD art. 11)
Tudo que envolve paciente é dado sensível. Isso significa:
- **NUNCA** logar conteúdo de mensagens em texto puro (só metadata: id, timestamp, status)
- **NUNCA** armazenar dados de paciente em cache externo (Redis pode, mas com TTL curto e sem PII no log)
- **SEMPRE** isolar query por `tenant_id` — qualquer query sem filtro de tenant é bug crítico
- Soft delete obrigatório com flag `deleted_at`; hard delete só via job de retenção
- Audit log em toda operação de leitura/escrita de paciente

### 2.2 WhatsApp pode banir número
- Rate limit é lei: nunca passar dos limites configurados, mesmo "só dessa vez"
- Toda campanha precisa ter opt-in registrado
- Mensagens devem ter variação (a IA reescreve cada uma) — texto idêntico em massa = ban
- Janela de disparo: 9h-20h horário local da clínica, nunca domingo, nunca feriado nacional

### 2.3 IA não pode dar consulta médica/odontológica
A IA atende, qualifica, agenda. **NUNCA** opina sobre sintoma, diagnóstico, tratamento ou medicamento. Toda alteração no prompt base precisa preservar essa restrição. Existem guardrails em código que validam isso — não remover sem discussão.

### 2.4 ICP é clínica de odonto pequena/média
- 1-3 unidades, 2-8 cadeiras, 800-5000 pacientes
- Dono é dentista que virou gestor, não é técnico
- Onboarding precisa funcionar em <7 dias sem TI
- UX otimizada para iPad/desktop, raramente celular

---

## 3. Stack e versões

```
Backend:      Node.js 20 LTS + Fastify
DB:           PostgreSQL 16
Cache/Fila:   Redis 7 + BullMQ
WhatsApp:     Evolution API (latest stable)
IA:           Anthropic Claude (Haiku pra triagem, Sonnet pra conversas)
Frontend:     React 18 + Vite + TypeScript + Tailwind + shadcn/ui
Auth:         JWT + refresh token (httpOnly cookie)
Pagamento:    Pagar.me (Pix + cartão recorrente brasileiro)
Hosting:      Hetzner (igual stack atual do CRM do Verê)
Email:        Resend ou AWS SES
Observability: Pino logs + Sentry (sem PII nos logs)
```

**NÃO usar:**
- ORM pesado (Prisma é OK; sem TypeORM)
- MongoDB ou qualquer NoSQL pra dados de paciente
- Vercel/Netlify pra backend (custo escala mal com WhatsApp)
- OpenAI como IA padrão (custo + LGPD); Claude é o padrão

---

## 4. Arquitetura

### 4.1 Multi-tenancy
**Estratégia escolhida: row-level com `tenant_id` em toda tabela.**

Motivo: até 200 clientes é mais simples operacionalmente que schema-per-tenant. Migrações são únicas, backup é único, debug é mais fácil. Quando passar de 200 clientes ou um cliente enterprise pedir isolamento físico, criar instância dedicada.

**Regra inegociável:** toda query DEVE filtrar por `tenant_id`. Usar middleware/contexto que injeta `tenant_id` automaticamente. Qualquer raw SQL precisa de revisão.

### 4.2 Camadas
```
/apps
  /api          → Fastify, rotas, controllers
  /web          → React frontend
  /worker       → BullMQ workers (disparos, IA, webhooks)
/packages
  /db           → Prisma schema, migrations, client tipado
  /shared       → Tipos compartilhados, validações Zod
  /ai           → Cliente Claude, prompts, guardrails
  /whatsapp     → Wrapper Evolution API
  /billing      → Wrapper Pagar.me
```

### 4.3 Filas (BullMQ)
- `campaign-dispatch` → dispara campanha respeitando rate limit
- `ai-conversation` → processa mensagem recebida, gera resposta
- `appointment-confirm` → confirma consulta 48h e 3h antes
- `recall-scheduler` → roda diariamente, agenda recalls automáticos
- `webhook-evolution` → recebe webhook do WhatsApp, processa async

Cada fila tem retry exponencial e DLQ. Falha de IA não pode travar fila.

### 4.4 Reaproveitamento do CRM do Verê
Este projeto é fork conceitual (não literal) do CRM do Verê. Reaproveitar:
- Sistema de auth + middleware multi-tenant
- Wrapper Evolution API
- Editor de prompt IA (componente React)
- BullMQ setup + retry policy
- Estrutura de webhook handler

**Não reaproveitar copiando arquivo por arquivo.** Refatorar pra ficar limpo neste projeto. Schema é diferente.

---

## 5. Modelo de dados (essencial)

```
tenant
  id, name, plan, status, created_at, ...

user (equipe da clínica)
  id, tenant_id, email, password_hash, role, ...

patient (paciente da clínica)
  id, tenant_id, phone_normalized (unique por tenant),
  full_name, birth_date, first_visit_at, last_visit_at,
  total_visits, total_spent_cents, tags (jsonb),
  custom_fields (jsonb), opt_in_at, opt_out_at,
  deleted_at, created_at, updated_at

visit (histórico de consultas)
  id, tenant_id, patient_id, date, procedure, value_cents, ...

treatment (tratamento em aberto)
  id, tenant_id, patient_id, name, started_at,
  expected_sessions, completed_sessions, status, ...

campaign
  id, tenant_id, name, segment_filter (jsonb),
  template_id, schedule_config, status,
  started_at, finished_at, ...

message (mensagens disparadas)
  id, tenant_id, campaign_id, patient_id,
  content_hash, status (queued/sent/delivered/read/failed),
  sent_at, delivered_at, read_at, ...

conversation
  id, tenant_id, patient_id, status (ai/human/closed),
  last_message_at, ai_handoff_reason, ...

chat_message (mensagens da conversa)
  id, tenant_id, conversation_id, direction (in/out),
  content, ai_generated (bool), sent_at, ...

appointment
  id, tenant_id, patient_id, scheduled_at,
  status (scheduled/confirmed/completed/no_show/cancelled),
  procedure, value_cents, source (ai/manual/integration), ...

ai_config (configuração de IA por tenant)
  id, tenant_id, base_prompt, tone, faq_content,
  trigger_words_handoff, ticket_medio_cents,
  business_hours (jsonb), ...

audit_log
  id, tenant_id, user_id, action, entity, entity_id,
  metadata (jsonb sem PII), ip, created_at
```

**Convenções:**
- IDs: `cuid()` (não autoincrement, não UUID v4)
- Money: SEMPRE em centavos (`int`), nunca decimal
- Telefone: `phone_normalized` em formato E.164 (`+5543991234567`)
- Datas: `timestamptz`, sempre UTC no banco, conversão no frontend
- JSONB pra campos flexíveis, com schema validado em Zod na aplicação

---

## 6. Convenções de código

### 6.1 Estilo
- TypeScript strict mode em TUDO
- ESLint + Prettier (config compartilhada do monorepo)
- Imports absolutos via path aliases (`@/db`, `@/ai`, etc)
- Sem `any`. Se precisar, comenta o motivo
- Funções puras > classes. Classes só pra wrappers de SDK externo

### 6.2 Naming
- Português pra entidades de domínio do USUÁRIO (UI, documentação, mensagens)
- Inglês pra código (tabelas, funções, variáveis, commits)
- Exemplo: tabela `patient`, campo `last_visit_at`, UI mostra "Última visita"

### 6.3 Validação
- Toda input de API valida com Zod
- Schema Zod fica em `packages/shared/schemas/`
- Erros de validação retornam 400 com mensagem amigável em PT-BR

### 6.4 Erros
- Erros operacionais: classe `AppError` com code, message, statusCode
- Erros inesperados: log no Sentry, retorna 500 genérico
- NUNCA vazar stack trace ou query SQL na resposta

### 6.5 Testes
- Vitest pra unit/integration
- Foco em testar: lógica de segmentação, rate limit, guardrails da IA, isolamento multi-tenant
- Coverage mínima nos módulos críticos: 80%
- Pode pular teste de CRUD trivial

---

## 7. IA — prompts, guardrails e custo

### 7.1 Política de modelo
- **Triagem rápida** (intenção do paciente, classificação): `claude-haiku-4-5`
- **Conversação personalizada**: `claude-sonnet-4-6` (default) ou superior conforme custo
- **Reescrita de campanha**: `claude-haiku-4-5` (volume alto, tarefa simples)

Toda chamada de IA passa por `packages/ai/client.ts`. Não chamar SDK direto de outro lugar.

### 7.2 Prompt base (estrutura)
```
[Identidade] Você é a assistente virtual da {nome_da_clinica}, especializada em {especialidade}.
[Tom] {tom configurado pelo cliente: formal/informal/regional}
[Restrições inegociáveis]
  - NUNCA dê diagnóstico, opinião clínica ou prescrição
  - NUNCA prometa resultado de tratamento
  - NUNCA fale sobre preço sem confirmar com humano (a não ser que esteja no FAQ)
  - Se sentir urgência/emergência, transfira pra humano imediatamente
[Objetivo] Acolher, qualificar interesse e agendar consulta
[Contexto] FAQ da clínica: {faq_content}
[Histórico do paciente] {dados não sensíveis: última visita, tratamento se houver}
```

### 7.3 Guardrails em código
Existe um filtro pós-resposta que verifica se a IA:
- Mencionou diagnóstico (lista de palavras-gatilho)
- Prometeu resultado
- Deu preço sem fallback

Se detectado, a mensagem NÃO é enviada e é escalada pra humano. Não bypassar esse filtro sem discussão.

### 7.4 Custo de IA
Meta: <R$10/cliente/mês em custo de IA no plano Starter.
Estratégias:
- Cache de respostas comuns (FAQ direto sem chamar IA)
- Haiku pra primeiro turno de triagem
- Limite de 8 turnos por conversa antes de transferir pra humano
- Conversa idle por 24h é encerrada

---

## 8. WhatsApp — Evolution API

### 8.1 Setup
- Pool compartilhado pra Starter (clientes dividem instâncias)
- Instância dedicada pra Pro e acima
- Aquecimento de número novo: 7 dias com volume crescente antes de campanha em massa

### 8.2 Rate limits (Starter)
- Máx 30 msgs/min por número
- Máx 1000 msgs/dia por número
- Pausa de 5-15s aleatória entre mensagens
- Variação obrigatória de texto (IA reescreve)

### 8.3 Webhook
Endpoint: `POST /webhooks/evolution/:tenant_id`
Verifica assinatura (header `x-evolution-signature`).
Coloca evento em fila `webhook-evolution` e retorna 200 IMEDIATAMENTE. Processamento é assíncrono.

---

## 9. Integrações com software de gestão

Prioridade de integração (do mais comum entre clientes para o menos):
1. **Importação via CSV/Excel** — universal, MVP
2. **Clinicorp** — via API ou export (validar)
3. **Easy Dental** — via export (provavelmente sem API)
4. **Sonia/Mercos** — investigar
5. **Doctoralia** — só agenda, não base

**Decisão atual:** MVP só suporta CSV. Integração nativa entra na fase 2 quando soubermos quais sistemas os primeiros 20 clientes usam.

---

## 10. O que está fora de escopo (NÃO FAZER sem discussão)

- Prontuário eletrônico (problema regulatório CFO/CFM)
- Teleconsulta
- Pagamento online de consulta (regulado pelo CFM no contexto de saúde)
- Captação de novo paciente via ads (foco é base existente)
- App mobile nativo (web responsivo é suficiente na fase atual)
- Multi-idioma (só PT-BR)
- Atendimento de hospital ou rede grande
- Integração com convênio/plano de saúde

---

## 11. Estado atual do projeto

**Fase:** Pré-MVP. Repositório recém-criado.

**Próximos marcos:**
1. Setup do monorepo + auth + multi-tenant básico
2. Importador de CSV + segmentação
3. Editor de campanha + disparo via Evolution
4. IA conversacional básica
5. Dashboard de ROI
6. Onboarding do primeiro piloto

**Pendências de decisão:**
- Nome final + domínio (ClínicaFlow é working title)
- Pagar.me vs Stripe (testar UX de checkout brasileiro)
- Schema Prisma vs Drizzle (Prisma por default, mas Drizzle se quiser mais controle)

---

## 12. Como trabalhar com este repositório

### 12.1 Antes de qualquer tarefa
1. Ler este CLAUDE.md inteiro
2. Ler o `PRD-ClinicaFlow.md` na primeira sessão
3. Conferir `README.md` pra instruções de setup local
4. Em dúvida sobre escopo, perguntar ao Paulo antes de codar

### 12.2 Ao fazer mudanças
- Toda mudança de schema requer migração nomeada (`prisma migrate dev --name <nome>`)
- Toda nova rota de API documentada com OpenAPI (Fastify auto-gera)
- Toda mudança de prompt base da IA testada com 5 mensagens reais antes de subir
- Toda alteração de rate limit ou guardrail: comentar o motivo no PR

### 12.3 Ao terminar uma tarefa
- Atualizar este CLAUDE.md se a arquitetura mudou
- Atualizar o PRD se o escopo mudou
- Rodar testes da área afetada
- Conferir que migrations rodam do zero em ambiente limpo

### 12.4 Commits
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- Em inglês
- Mensagem do corpo pode ser em PT se for decisão de negócio

---

## 13. Contatos e responsabilidades

- **Product/Tech Lead:** Paulo
- **DPO (LGPD) interino:** Paulo (terceirizar antes de 50 clientes)
- **Suporte ao cliente:** Paulo (até contratar CS)

---

## 14. Histórico de decisões importantes (ADR resumido)

| Data | Decisão | Motivo |
|---|---|---|
| 2026-05-23 | Row-level multi-tenancy | Simplicidade até 200 clientes |
| 2026-05-23 | Claude como IA padrão | Custo + qualidade PT-BR + LGPD melhor que OpenAI |
| 2026-05-23 | Evolution API | Já dominamos no CRM do Verê |
| 2026-05-23 | MVP só odonto | Foco de pitch e templates |
| 2026-05-23 | Pagar.me | UX brasileira (Pix recorrente nativo) |

**Adicione novas decisões aqui sempre que tomar algo arquitetural.**
