# Pitfalls Research: ClínicaFlow

**Domain:** SaaS multi-tenant WhatsApp + IA para clínicas de saúde no Brasil
**Researched:** 2026-05-23
**Confidence:** HIGH (BullMQ, Evolution API, Prisma via Context7 docs) / MEDIUM (LGPD, WhatsApp ban via domain knowledge + official docs structure)

---

## 1. WhatsApp Ban: Número Banido por Spam

**Risk Level:** Critical

**O que vai errado:**
O número de WhatsApp é banido permanentemente pela Meta. Com Evolution API + Baileys (WhatsApp Web protocol), o risco é maior porque não é a API oficial. A Meta trata como comportamento suspeito qualquer padrão que pareça automação em massa. O ban pode ser temporário (horas/dias) ou permanente. Para um produto de campanhas em massa, perder o número que uma clínica usa para comunicação com pacientes é catastrófico.

**Por que acontece:**
- Mensagens idênticas disparadas para muitos números em curto intervalo (texto sem variação = fingerprint de spam)
- Disparos fora da janela natural de uso humano (madrugada, domingo)
- Alto volume de reports de spam pelos destinatários (paciente aperta "Reportar spam")
- Número novo sem aquecimento gradual
- Taxa de "não entregue" alta (números inválidos na base)
- Ausência de opt-in real — paciente não esperava a mensagem
- Múltiplos disparos para o mesmo destinatário em curto período

**Warning signs (detecção precoce):**
- `CONNECTION_UPDATE` com estado `close` logo após disparo em massa
- Resposta de erro `401` ou `403` nas chamadas de envio da Evolution API
- QR code exigido novamente após sessão ativa (Baileys foi desconectado pelo servidor da Meta)
- Taxa de `delivered` caindo abruptamente sem erro explícito
- Pacientes reclamando que não estão recebendo mensagens

**Prevention:**
- **Variação obrigatória de texto:** IA reescreve cada mensagem individualmente. Implementar hash de similaridade e rejeitar duplicatas acima de 70% de similaridade antes de enviar
- **Rate limit conservador:** máx 20 msgs/min (não 30 — manter margem de 33%), máx 800/dia (não 1000). Implementar via BullMQ `limiter: { max: 20, duration: 60_000 }` no worker de `campaign-dispatch`
- **Delay aleatório entre mensagens:** entre 3s e 15s (nunca fixo — padrão fixo é fingerprint). Usar `Math.random() * 12000 + 3000`
- **Typing indicator antes de enviar:** usar `POST /chat/sendPresence` com `presence: "composing"` e `delay: 1200` antes de cada mensagem. Simula comportamento humano (confirmado na Evolution API docs via Context7)
- **Janela de disparo:** apenas 9h-20h no fuso da clínica. Nunca domingo. Nunca feriado nacional
- **Aquecimento de número novo:** 7 dias com volume crescente antes de campanha em massa. Semana 1: máx 50 msgs/dia aumentando 50/dia
- **Opt-in explícito registrado:** nunca disparar para quem não deu consentimento. Registrar `opt_in_at` no banco antes de colocar na fila
- **Deduplicação por número:** nunca enviar mais de 1 mensagem de campanha por número por período configurável (padrão: 24h)
- **Monitorar `CONNECTION_UPDATE`:** listener em todas as instâncias. Se estado virar `close` após disparo, pausar fila imediatamente e alertar

**Phase to address:** Phase 1 (setup Evolution API wrapper) + Phase 3 (campaign dispatch)

---

## 2. Multi-Tenant Data Leak: Query Sem `tenant_id`

**Risk Level:** Critical

**O que vai errado:**
Uma query retorna dados de múltiplos tenants (clínicas). Clínica A vê pacientes da Clínica B. No contexto de dados de saúde (LGPD art. 11), isso é uma violação grave que gera: notificação obrigatória à ANPD, multa de até 2% do faturamento (máx R$50M), destruição de reputação, possível cancelamento de contratos.

**Por que acontece em projetos Prisma:**
- Raw queries (`$queryRaw`) sem cláusula `WHERE tenant_id = $1` — Prisma não injeta filtro automaticamente
- `findFirst` sem `where: { tenantId }` — retorna o primeiro registro de qualquer tenant
- Joins/includes que atravessam fronteiras de tenant (ex: buscar `patient` pela `conversationId` sem verificar que a conversa pertence ao mesmo tenant)
- Refatoração que move lógica para dentro de transactions sem manter o contexto de tenant
- Middleware de tenant_id que falha silenciosamente em rotas novas
- Background jobs (BullMQ workers) que recebem apenas `entityId` sem `tenantId` na payload e fazem lookup sem filtro

**Warning signs:**
- Testes de integração que passam mesmo sem `tenantId` no where (cobertura insuficiente)
- Raw SQL nas reviews de código sem cláusula WHERE por tenant
- Workers recebendo payload com apenas `id` sem `tenantId`
- Logs mostrando queries retornando N rows quando N > tamanho esperado para 1 tenant

**Prevention:**
- **Prisma Extension com filtro global:** usar `$extends` para injetar `where: { tenantId }` em todos os `findMany`, `findFirst`, `findUnique` automaticamente. O contexto de tenant vem de `AsyncLocalStorage` populado pelo middleware de auth:

```typescript
// packages/db/src/tenant-client.ts
import { AsyncLocalStorage } from 'async_hooks';

export const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

export function createTenantPrismaClient(basePrisma: PrismaClient) {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const store = tenantContext.getStore();
          if (!store?.tenantId) {
            throw new Error(`[SECURITY] tenantId missing for ${model}.${operation}`);
          }
          const writes = ['create', 'createMany'];
          const reads  = ['findMany', 'findFirst', 'findUnique',
                          'update', 'updateMany', 'delete', 'deleteMany'];
          if (writes.includes(operation)) {
            args.data = { ...args.data, tenantId: store.tenantId };
          }
          if (reads.includes(operation)) {
            args.where = { ...args.where, tenantId: store.tenantId };
          }
          return query(args);
        },
      },
    },
  });
}
```

- **Raw SQL bloqueado por lint:** regra ESLint customizada que falha o CI se encontrar `$queryRaw` sem comentário `// REVIEWED: tenant-isolated by [autor]`
- **Payload de jobs SEMPRE inclui `tenantId`:** tipo TypeScript obrigatório para todas as job payloads — se o campo não existir, não compila
- **Teste de tenant isolation:** suite de testes dedicada que cria 2 tenants, popula dados em ambos, e verifica que queries de um não retornam dados do outro. Rodar em CI obrigatoriamente
- **Audit log em todo acesso:** middleware que registra `{ tenantId, userId, action, entity, entityId }` antes de retornar dados

**Phase to address:** Phase 1 (foundation — nunca deixar para depois)

---

## 3. LGPD em Saúde: Dado Sensível Art. 11

**Risk Level:** Critical

**O que vai errado:**
Dados de saúde têm regime jurídico diferente de dados pessoais comuns (LGPD art. 11). O tratamento só é permitido com consentimento específico do titular ou em hipóteses restritíssimas. Multas chegam a R$50M ou 2% do faturamento. Para um SaaS, o risco é o cliente (clínica) ser autuado e responsabilizar o fornecedor (ClínicaFlow) contratualmente.

**O que auditores da ANPD verificam:**
- **Base legal:** qual é a base que autoriza o tratamento? Para saúde: consentimento do paciente ou tutela da saúde (art. 11, II, f). O consentimento do dentista não é suficiente — precisa do paciente
- **Registro de consentimento:** opt-in com timestamp, versão do texto apresentado, canal onde foi coletado
- **Minimização:** você está coletando apenas o necessário? Campo `medical_notes` livre-form em texto puro é problema
- **Retenção:** dados devem ser excluídos quando não mais necessários. ClínicaFlow não é prontuário — sua retenção é diferente da exigência CFO/CFM de 5 anos
- **DPO/Encarregado:** obrigatório para quem trata dados sensíveis em escala. Precisa estar indicado publicamente no site
- **Logs com PII:** log de conteúdo de mensagem em texto puro é violação imediata

**Erros mais comuns em projetos similares:**
- Conteúdo de conversa em logs de aplicação (Pino, Sentry, console.log)
- Redis sem TTL para dados de sessão e contexto de conversa (dado persiste indefinidamente)
- Backup de banco sem criptografia em repouso
- Resposta de API retornando `content` de `chat_message` em endpoints de listagem quando o front não precisaria
- Soft delete implementado mas dados visíveis via raw SQL sem filtro de `deleted_at`
- Terceiros integrados (Sentry, analytics) recebendo PII de paciente via metadata de erro

**Warning signs:**
- `console.log(message)` em qualquer lugar que processa resposta de paciente
- Sentry `captureException` com objeto de erro que contém `message.content`
- Endpoint de API retornando campos além do mínimo necessário para o front
- Redis keys sem TTL definido
- Ausência de `deleted_at` check em queries que leem dados de paciente

**Prevention:**
- **Log sanitizer obrigatório:** função `sanitizeForLog(obj)` que remove campos sensíveis (`content`, `text`, `message`, `body`, `full_name`, `phone`, `birth_date`) antes de qualquer log
- **Sentry scrubbing configurado:** usar `beforeSend` do Sentry para remover dados sensíveis de stacks e breadcrumbs antes de enviar
- **Redis TTL enforced por tipo:** contexto de conversa IA: TTL 24h. Sessão de usuário: TTL 7 dias. Nunca persistir conteúdo de mensagem no Redis
- **`select` explícito no Prisma:** nunca usar `findMany` sem `select` em endpoints de listagem. TypeScript deve tornar impossível retornar campos que não estão no tipo da resposta
- **Consentimento duplo:** a clínica aceita os Termos (processa dados em nome da clínica), e o paciente aceita via mensagem de opt-in antes do primeiro disparo. Registrar `opt_in_at`, `opt_in_channel`, `opt_in_version` na tabela `patient`
- **DPO externo:** indicar antes do primeiro cliente pagante. Serviços de DPO-as-a-service no Brasil custam ~R$500-1500/mês

**Phase to address:** Phase 1 (nunca deixar para depois — retroativo é impossível)

---

## 4. IA Hallucination em Contexto de Saúde

**Risk Level:** Critical

**O que vai errado:**
A IA responde com informação que parece diagnóstico, prognóstico ou conselho médico/odontológico mesmo com guardrails no prompt. Exemplos: "Esse sangramento que você descreveu pode ser gengivite" (diagnóstico), "Com o canal que fizemos há 6 meses não deveria dolar mais" (afirmação clínica), "Para dor de dente, analgésico geralmente ajuda" (prescrição implícita).

**Por que acontece mesmo com guardrails em prompt:**
- Instrução no prompt é considerada pelo Claude como "soft constraint" — sob pressão conversacional suficiente o modelo pode ceder
- Paciente usa framing que contorna o guardrail: "Não estou pedindo diagnóstico, só quero saber se é normal..."
- Contexto longo de conversa faz o modelo "esquecer" restrições do system prompt (context dilution)
- Haiku tem guardrails menos robustos que Sonnet — usar Haiku para triagem mas Sonnet para toda conversa após primeiro turno
- Prompt base editado pelo cliente (clínica) pode remover ou enfraquecer restrições
- IA gerando resposta sobre FAQ da clínica que contém informação clínica implícita

**Warning signs:**
- Conversa com mais de 6 turnos sem transferência para humano
- Paciente usando palavras como "dor", "sangramento", "febre", "sintoma", "remédio" sem trigger de escalada
- Resposta da IA com qualificadores clínicos: "parece ser", "provavelmente é", "costuma ser"
- Taxa de transferência para humano caindo abaixo de 5% (esperado ~15-20% das conversas)

**Prevention:**
- **Guardrail duplo: prompt + filtro pós-resposta em código** (nunca só um dos dois):

```typescript
// packages/ai/guardrails.ts
const CLINICAL_TRIGGERS = [
  /diagnos/i,
  /gengivite|periodontite|cárie|abscess/i,
  /você (tem|está com|parece ter)/i,
  /provavelmente (é|são)/i,
  /tomar.{0,20}(remédio|medicamento|analgésico|antibiótico)/i,
  /não (deveria|deve) dol/i,
  /normal (ter|sentir|ver)/i,
  /resultado (do|de|da) tratamento/i,
];

export function containsClinicalAdvice(text: string): boolean {
  return CLINICAL_TRIGGERS.some(pattern => pattern.test(text));
}

// No worker de ai-conversation:
const response = await claudeClient.complete(...);
if (containsClinicalAdvice(response.text)) {
  await escalateToHuman(conversation, 'clinical_guardrail_triggered');
  await logGuardrailTrigger(/* só o nome do trigger, sem PII */);
  return; // não enviar a mensagem
}
```

- **Limite de turnos:** após 8 turnos sem agendamento, transferir para humano com contexto. Configurável por clínica (padrão 8, mín 5, máx 15)
- **Encerramento por idle:** conversa sem resposta do paciente por 4h fecha automaticamente
- **Teste de adversarial prompting:** antes de cada release, rodar suite de 50 prompts adversariais que tentam extrair conselho clínico. Manter no repositório em `tests/ai-guardrails.spec.ts`
- **Monitorar taxa de guardrail trigger em produção:** métrica `guardrail_triggers_per_1000_messages`. Spike indica prompt editado por cliente causando problema
- **Seção read-only no editor de prompt:** a seção "[Restrições inegociáveis]" deve ser read-only no UI, editável apenas pelo admin do sistema

**Phase to address:** Phase 4 (IA conversacional) — não pode lançar sem esses controles

---

## 5. BullMQ em Produção: Filas Travadas e Jobs Stalled

**Risk Level:** High

**O que vai errado:**
Jobs ficam travados no estado "active" indefinidamente (stalled), não são processados, ou são processados duas vezes (double processing). Em campanhas de WhatsApp, double processing significa enviar a mesma mensagem duas vezes para o paciente — constrangedor e aumenta risco de ban.

**Causas documentadas (BullMQ docs oficiais via Context7):**

**5a. Redis com `maxmemory-policy` diferente de `noeviction` — CAUSA MAIS CRÍTICA:**
Se o Redis está configurado como cache (padrão em muitas instalações: `allkeys-lru`), quando a memória esgota, o Redis remove keys arbitrariamente — incluindo keys de controle interno do BullMQ. O resultado é inconsistência de estado silenciosa: jobs aparecem como "active" mas o worker não está processando, jobs desaparecem da fila sem rastro, rate limits param de funcionar.

A documentação oficial do BullMQ diz explicitamente: "This is the only setting that guarantees the correct behavior of the queues."

```bash
# redis.conf — obrigatório antes de qualquer deploy em produção
maxmemory-policy noeviction
```

**5b. Jobs Stalled por `lockDuration` expirado:**
BullMQ renova o lock do job a cada `lockRenewTime` (padrão: metade do `lockDuration` = 15s). Se o processamento demora mais que `lockDuration` (30s padrão), o job é considerado stalled e movido de volta para waiting — podendo ser processado novamente por outro worker (double processing).

Para jobs de IA (5-10s por chamada de API, com retries internos), o padrão pode ser insuficiente:

```typescript
const worker = new Worker('ai-conversation', processor, {
  connection,
  lockDuration: 120_000,    // 2 minutos para jobs de IA
  stalledInterval: 60_000,  // verificar stalled a cada 1 min
});
```

**5c. Worker crashando sem graceful shutdown:**
Se o processo Node morre abruptamente (OOM, SIGKILL), jobs ativos ficam stalled até o próximo `stalledInterval`. Cada job pode ser reprocessado até `maxStalledCount` vezes (padrão: 1). Para campanhas de WhatsApp, isso significa mensagem duplicada.

Prevenção de double-send via idempotência:
```typescript
// Antes de enviar qualquer mensagem WhatsApp
await prisma.message.upsert({
  where: { jobId: job.id }, // índice único em jobId na tabela message
  create: { jobId: job.id, status: 'sent', ... },
  update: {},               // se já existe, não faz nada — idempotente
});
```

**5d. Redis OOM por jobs acumulados:**
Sem `removeOnComplete` e `removeOnFail`, todos os jobs ficam armazenados no Redis para sempre. Uma campanha de 1000 mensagens x 30 tenants x 12 meses = 360.000 jobs armazenados. Redis estoura memória.

```typescript
const worker = new Worker('campaign-dispatch', processor, {
  connection,
  removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },  // 7 dias ou 10k jobs
  removeOnFail:    { age: 30 * 24 * 3600, count: 50_000 },   // 30 dias para DLQ manual
});
```

**5e. `enableOfflineQueue: true` (padrão) na instância Queue:**
Se Redis cair, a Queue continua aceitando `queue.add()` e armazena comandos em memória até o Redis voltar. Com volume alto de campanhas, isso pode consumir memória do processo Node até OOM. Para a Queue (não o Worker), desabilitar:

```typescript
const campaignQueue = new Queue('campaign-dispatch', {
  connection: { ...redisConfig, enableOfflineQueue: false },
});
```

**Warning signs:**
- Jobs no estado "active" há mais de 5 minutos (verificar via Bull Board)
- Pacientes reportando mensagem duplicada
- Redis memory usage crescendo constantemente sem estabilizar
- Worker não processando novos jobs mas sem erro visível nos logs

**Prevention checklist:**
- [ ] `maxmemory-policy noeviction` verificado no Redis de produção antes de qualquer deploy
- [ ] `removeOnComplete` e `removeOnFail` configurados em todos os workers
- [ ] Graceful shutdown em SIGTERM e SIGINT em todos os worker processes
- [ ] `lockDuration` ajustado por tipo de job (disparo: 60s, IA: 120s)
- [ ] Idempotency key (`jobId` com índice único) em toda operação de envio de mensagem
- [ ] Bull Board instalado e monitorado (`@bull-board/fastify`)
- [ ] Alerta no Sentry para evento `stalled` de qualquer fila
- [ ] `QueueEvents` listener para logar falhas e métricas

**Phase to address:** Phase 1 (setup BullMQ) + Phase 3 (campaign dispatch)

---

## 6. Evolution API: Instabilidades e Reconnection

**Risk Level:** High

**O que vai errado:**
A instância Evolution API desconecta do WhatsApp (estado `close`) e fica offline silenciosamente. Campanhas continuam sendo enfileiradas, mas as chamadas de envio falham. O problema pode passar despercebido por horas se não houver monitoramento ativo do estado da instância.

**Causas:**
- WhatsApp detecta comportamento suspeito e força logout da sessão Baileys
- Instabilidade de rede no servidor Hetzner
- Atualização do protocolo do WhatsApp Web — Baileys precisa ser atualizado para compatibilidade
- Evolution API process crashando por OOM quando há muitas instâncias no pool Starter

**Comportamento do webhook `CONNECTION_UPDATE` (Evolution API docs):**
A Evolution API envia `CONNECTION_UPDATE` para o webhook configurado quando o estado muda. Possíveis estados: `open`, `connecting`, `close`. O evento `close` pode ser acompanhado de `lastDisconnect.error.output.statusCode`:
- `401`: sessão invalidada — logout forçado pelo WhatsApp. Precisa de novo QR scan pelo cliente
- `408`/`500`/`503`: erro temporário — tentar reconexão automática via `POST /instance/restart/{instanceName}`

**Warning signs:**
- Webhook recebendo `CONNECTION_UPDATE` com `state: "close"`
- Chamadas de `POST /message/sendText` retornando erro 4xx/5xx
- Fila `campaign-dispatch` acumulando jobs sem processar (backpressure visível no Bull Board)
- Nenhuma mensagem entregue em janela de mais de 10 minutos durante horário de disparo

**Prevention:**
- **Health check periódico de instâncias:** a cada 5 minutos, job chama `GET /instance/connectionState/{instanceName}` para cada instância ativa. Se `state !== 'open'`, tenta `POST /instance/restart/{instanceName}`. Se ainda offline após 3 tentativas, pausa filas do tenant e notifica

- **Webhook `CONNECTION_UPDATE` como gatilho de reconexão:**

```typescript
// apps/worker/src/handlers/evolution-webhook.ts
if (event === 'CONNECTION_UPDATE' && data.state === 'close') {
  const statusCode = data?.lastDisconnect?.error?.output?.statusCode;
  if (statusCode === 401) {
    // Logout forçado — não tenta reconectar automaticamente
    await pauseTenantQueues(tenantId);
    await notifyTenantSessionExpired(tenantId);
  } else {
    // Erro temporário — agendar restart
    await scheduleReconnect(instanceName, tenantId);
  }
}
```

- **Circuit breaker para envios:** se 3 envios consecutivos falharem para uma instância, pausar o worker daquela instância por 5 minutos antes de tentar novamente
- **Separar instâncias por tenant no Starter:** no pool compartilhado, não usar a mesma instância Evolution para 2 tenants. Uma instância banida ou desconectada não pode afetar outro cliente
- **Nunca chamar Evolution API dentro de transação de banco:** a chamada pode demorar ou falhar e provocar rollback de dados que já eram válidos

**Phase to address:** Phase 1 (wrapper Evolution API) + Phase 3 (campaign dispatch)

---

## 7. Prisma em Multi-Tenant: N+1, Indexes e Migrations

**Risk Level:** High

**Pitfall 7a: N+1 Queries em relatórios**

**O que vai errado:**
Dashboard de ROI busca campanhas, depois para cada campanha busca mensagens, depois para cada mensagem busca o paciente. Com 50 campanhas x 500 mensagens cada = 25.001 queries por carregamento de dashboard.

**Prevention:**
Sempre usar `include` ou `select` com relações aninhadas explícitas. Configurar `log: ['query']` em desenvolvimento para detectar N+1. Para relatórios agregados, usar raw SQL com `GROUP BY` via `$queryRaw` (documentado com anotação de tenant isolation).

**Pitfall 7b: Índices faltando em tabelas com `tenant_id`**

**O que vai errado:**
Queries como `WHERE tenant_id = $1 AND patient_id = $2` sem índice composto fazem full table scan. Com 200 tenants x 5000 pacientes = 1M de rows em `patient` — cada query demora segundos.

**Índices obrigatórios no schema Prisma (migration inicial):**

```prisma
model Patient {
  @@index([tenantId])
  @@index([tenantId, phoneNormalized])
}
model Message {
  @@index([tenantId, campaignId])
  @@index([tenantId, status])
}
model Conversation {
  @@index([tenantId, status])
  @@index([tenantId, patientId])
}
model Appointment {
  @@index([tenantId, scheduledAt])
}
model ChatMessage {
  @@index([conversationId, sentAt(sort: Desc)])
}
```

**Pitfall 7c: Migration falha em produção com dados existentes**

**O que vai errado:**
`ALTER TABLE ADD COLUMN NOT NULL` sem `DEFAULT` falha se a tabela tem dados. `CREATE INDEX` sem `CONCURRENTLY` bloqueia writes por minutos em tabelas grandes.

**Prevention:**
- Sempre adicionar coluna como nullable primeiro, popular o campo, depois adicionar constraint NOT NULL em migration separada
- Para índices em tabelas grandes: usar raw SQL `CREATE INDEX CONCURRENTLY` em migrations (Prisma não faz isso automaticamente — usar `$executeRaw`)
- Testar migrations em dump de produção antes de aplicar
- Manter script de rollback para cada migration crítica

**Pitfall 7d: Connection pool esgotado**

**O que vai errado:**
Prisma usa connection pool (padrão: `num_cpus * 2 + 1` connections por processo). Com 5 workers BullMQ cada instanciando seu próprio `PrismaClient`, o total de connections pode exceder o `max_connections` do PostgreSQL (padrão: 100). Queries começam a falhar com timeout de pool.

**Prevention:**
- Compartilhar uma única instância de `PrismaClient` por processo (singleton pattern obrigatório)
- Configurar `connection_limit` explícito na DATABASE_URL: `?connection_limit=10`
- Para workers BullMQ: pool separado e menor (5 connections por worker)
- Considerar PgBouncer na frente do PostgreSQL quando passar de 10 workers simultâneos

**Phase to address:** Phase 1 (schema + migrations) + Phase 2 (queries de campanha)

---

## 8. Rate Limiting Insuficiente: Burst de Mensagens Acidental

**Risk Level:** High

**O que vai errado:**
O sistema envia mensagens acima do limite seguro do WhatsApp mesmo com rate limit configurado. Situações de risco:
- Múltiplos workers processando a mesma fila sem coordenação por instância WhatsApp
- Campanha pausada e retomada causando burst ao retomar
- Dois tenants diferentes compartilhando o mesmo número WhatsApp

**Como o rate limiter do BullMQ funciona e onde falha:**
O `limiter: { max: 30, duration: 60_000 }` configurado no Worker é global por fila, não por número de WhatsApp. Se a fila `campaign-dispatch` processa mensagens de diferentes instâncias WhatsApp, o limite de 30/min se aplica à fila inteira — um único número pode receber todos os 30 disparos daquele minuto.

**Prevention:**
- **Rate limit no nível do wrapper da Evolution API**, não apenas no BullMQ:

```typescript
// packages/whatsapp/src/rate-limiter.ts
const limiters = new Map<string, { tokens: number; lastRefill: number }>();

export async function throttledSend(
  instanceName: string,
  sendFn: () => Promise<void>,
) {
  const limiter = getOrCreateLimiter(instanceName); // 20 tokens / 60s
  await limiter.consume(1);
  // Delay humano: entre 3s e 15s
  await new Promise(r => setTimeout(r, 3000 + Math.random() * 12000));
  return sendFn();
}
```

- **Pausar 60s ao retomar campanha pausada:** ao retomar, aplicar delay antes de retomar disparo
- **Nunca compartilhar instância WhatsApp entre tenants** no pool Starter
- **Monitorar taxa de envio por instância:** alerta se passar de 15 msgs/min (75% do limite conservador)

**Phase to address:** Phase 3 (campaign dispatch)

---

## 9. Onboarding de Dados: Problemas de Importação CSV

**Risk Level:** Medium-High

**O que vai errado:**
O CSV exportado do Clinicorp, Easy Dental ou planilha Excel da clínica chega com problemas que corrompem a base de pacientes: nomes com caracteres estranhos, telefones em 20 formatos diferentes, duplicatas não detectadas, datas ambíguas.

**Problemas comuns em ordem de frequência:**

**9a. Encoding:**
- Arquivos do Excel/Windows geralmente são `windows-1252` (latin1), não UTF-8
- Nome "Conceição" vira lixo se não detectar o encoding antes de parsear
- BOM (codepoint U+FEFF, Byte Order Mark) no início de arquivos UTF-8 exportados pelo Excel causa falha no parse do cabeçalho de colunas

**9b. Formatos de telefone:**
Uma base de 2000 pacientes pode ter telefones em todos esses formatos:
`43991234567`, `(43) 99123-4567`, `+55 43 99123-4567`, `43 9 91234567`, `991234567`
Todos precisam ser normalizados para E.164: `+5543991234567`

**9c. Duplicatas:**
Deduplicação deve ser por telefone normalizado (identificador canônico). Variações de nome ("Maria Silva", "MARIA SILVA") não são confiáveis para deduplicação.

**9d. Datas ambíguas:**
`05/06/2020`: é 5 de junho ou 6 de maio? Depende do software que exportou. Clínicas do interior frequentemente têm configuração de data americana em softwares antigos.

**9e. Campos faltando:**
A clínica exporta apenas nome e telefone, sem data de última visita — o sistema precisa funcionar com dados parciais sem quebrar a segmentação.

**9f. Arquivo grande:**
Upload de CSV de 50k linhas: ~15MB. Parse síncrono bloqueia o processo. Necessário streaming.

**Prevention:**
- **Detecção automática de encoding:** usar `chardet` ou `iconv-lite` para detectar encoding antes de parsear. Converter para UTF-8 antes de qualquer processamento
- **BOM stripping:** remover o codepoint U+FEFF automaticamente se presente no início do arquivo antes de parsear o cabeçalho
- **Normalização de telefone robusta:** implementar `normalizePhone(raw: string): string | null` que:
  1. Remove tudo que não é dígito: `raw.replace(/\D/g, '')`
  2. Se 10 dígitos com DDD válido: adicionar `9` após DDD (celular sem o nono dígito)
  3. Se 11 dígitos: verificar DDD válido
  4. Se 12 dígitos começando com `55`: telefone brasileiro sem o `+`
  5. Adicionar `+55` e validar com regex E.164: `/^\+55[1-9][1-9]\d{8,9}$/`
  6. Se inválido: colocar na lista de erros, não importar silenciosamente
- **Preview antes de salvar:** mostrar amostra de 10 linhas com os campos mapeados antes de confirmar importação
- **Importação como job assíncrono:** para arquivos > 1000 linhas, processar em background (BullMQ) e notificar quando terminar
- **Relatório de importação:** ao final, mostrar: `X pacientes importados, Y duplicatas ignoradas, Z linhas com erro (baixar CSV de erros)`

**Phase to address:** Phase 2 (importador CSV)

---

## 10. SaaS para Clínicas: Churn por Não-Uso e Onboarding Falho

**Risk Level:** Medium-High

**O que vai errado:**
A clínica paga, importa a base, e não dispara a primeira campanha. Nunca. Churn em 30-60 dias. Esse é o padrão mais comum em SaaS para pequenas empresas de saúde: o gestor comprou, o dentista não tem tempo, a recepcionista tem medo de "estragar", e o sistema fica em standby até o cancelamento.

**Por que acontece especificamente com clínicas:**
- Dentista-gestor trabalha 6 dias por semana atendendo — tempo zero para onboarding
- Recepcionista teme que a IA fale "errado" com paciente e cause problema
- Onboarding técnico (importar CSV, mapear colunas, configurar horários) parece "complicado"
- Primeiro resultado demora: campanha disparada hoje, paciente agenda, consulta em 2 semanas, ROI visível só depois de 3-4 semanas
- Se o primeiro disparo não tiver boa taxa de resposta, a clínica desiste antes de otimizar

**Warning signs de churn iminente:**
- Cliente ativou há mais de 7 dias e não disparou primeira campanha
- Cliente disparou campanha mas a taxa de resposta ficou abaixo de 3% (benchmark esperado: 8%)
- Última atividade no painel há mais de 10 dias
- Nenhum agendamento gerado via IA nos primeiros 30 dias

**Prevention:**
- **Onboarding ativo, não passivo:** acompanhar pessoalmente os primeiros 20 clientes. Agendamento de 30min logo após o pagamento para fazer o setup junto
- **"Primeira campanha em 24h":** meta de onboarding. Cliente importa a base no dia 1 e no dia 2 já disparou para os aniversariantes do mês (campanha mais fácil e menos intrusiva)
- **Templates prontos para odonto:** 6 templates de mensagem já configurados. Zero necessidade de editar prompt na primeira campanha
- **Notificações de ativação:** email automático se cliente fica 3 dias sem login ou 5 dias sem campanha disparada
- **ROI preview antes do primeiro disparo:** "Sua base tem 847 inativos há mais de 6 meses. Se recuperar 3% = 25 pacientes x R$280 ticket médio = R$7.000. Seu plano custa R$197."
- **Contato ativo em 14 dias:** se em 14 dias o cliente não disparou campanha, ligar (enquanto base pequena)

**Phase to address:** Phase 5-6 (onboarding + GTM)

---

## 11. Isolamento de Fila por Tenant: Starvation

**Risk Level:** Medium

**O que vai errado:**
Um tenant com campanha de 5000 mensagens monopoliza a fila `campaign-dispatch`, deixando outros tenants esperando horas para disparar campanhas menores. Em modelo de pool compartilhado Starter, isso viola a promessa implícita de serviço equivalente para todos.

**Prevention:**
- **Job groups por tenant:** usar `{ group: { id: tenantId } }` ao adicionar jobs. Com BullMQ Pro, isso garante concorrência máxima por grupo configurável
- **Sem Pro: fila por tenant ou round-robin manual:** nomear filas `campaign-dispatch:${tenantId}` e ter um scheduler que distribui capacidade entre tenants de forma justa
- **Limitar concorrência ativa por tenant:** máx 5 jobs ativos simultâneos por tenant. Implementar contador em Redis: `INCR campaign:active:{tenantId}` antes de processar, `DECR` ao finalizar
- **Prioridade inversamente proporcional ao volume:** campaigns com menos de 100 destinatários entram com `priority: 1`, campaigns com mais de 1000 entram com `priority: 10` (menor número = maior prioridade no BullMQ)

**Phase to address:** Phase 3 (campaign dispatch)

---

## 12. Segurança da API Evolution: Chaves Expostas

**Risk Level:** Medium

**O que vai errado:**
A API key global da Evolution API (`AUTHENTICATION_API_KEY`) é usada diretamente no código do backend sem segmentação por tenant. Se vazar, qualquer um pode criar instâncias, enviar mensagens ou deletar sessões de todos os clientes.

**Prevention:**
- Nunca usar a chave global no código de negócio — criar token por instância no momento da criação via API
- Tokens de instância armazenados criptografados no banco (não em texto puro)
- Evolution API em rede interna do Hetzner (private network) — não exposta à internet diretamente. O backend ClínicaFlow é o único que se comunica com ela
- Rate limit nas rotas de criação de instância: máx 5 instâncias criadas por hora por tenant

**Phase to address:** Phase 1 (setup Evolution API)

---

## 13. Fuso Horário e Horário de Disparo

**Risk Level:** Medium

**O que vai errado:**
Campanha configurada para disparar "às 9h" dispara às 9h UTC, que é 6h no Paraná/Minas Gerais. Paciente recebe mensagem às 6h da manhã.

**Prevention:**
- Sempre armazenar horários de disparo como `time + timezone` (ex: `09:00 America/Sao_Paulo`), nunca como hora absoluta UTC
- No banco: campo `business_hours` no `ai_config` armazena `{ open: "09:00", close: "20:00", timezone: "America/Sao_Paulo" }`
- Worker de disparo converte horário local da clínica para UTC antes de agendar job no BullMQ com `delay`
- Usar `date-fns-tz` ou `luxon` para conversões — nunca cálculo manual de offset
- Lista de feriados nacionais: manter atualizada para o ano corrente. Criar job anual de atualização ou usar API pública de feriados brasileiros

**Phase to address:** Phase 3 (campaign dispatch)

---

## 14. Webhook de Resposta do Paciente: Mensagem Perdida

**Risk Level:** Medium

**O que vai errado:**
O webhook `POST /webhooks/evolution/:tenant_id` não responde em menos de 2s e a Evolution API considera falha, não reenviando o evento. A mensagem do paciente é perdida — a IA nunca processa a resposta, e o paciente fica sem retorno.

**Prevention:**
- **Responder 200 imediatamente, processar assincronamente:**

```typescript
// apps/api/src/routes/webhooks/evolution.ts
fastify.post('/webhooks/evolution/:tenantId', async (req, reply) => {
  // Responde ANTES de qualquer processamento
  reply.code(200).send({ ok: true });

  setImmediate(async () => {
    const { tenantId } = req.params;
    const messageId = req.body?.data?.key?.id;
    if (!messageId) return;

    // Idempotência: previne duplo processamento por replay
    const isNew = await redis.set(
      `webhook:processed:${messageId}`,
      '1', 'NX', 'EX', 86400,
    );
    if (!isNew) return;

    await webhookQueue.add('process', { tenantId, payload: req.body });
  });
});
```

- **Verificar assinatura do webhook** via header `x-evolution-signature` antes de encaminhar para a fila
- **Idempotência por message ID:** checar `data.key.id` (message ID do WhatsApp) antes de processar — Evolution API pode reenviar o mesmo evento em caso de timeout

**Phase to address:** Phase 1 (webhook handler) + Phase 4 (IA conversacional)

---

## Priority Matrix

| Pitfall | Risk | Effort to Prevent | Priority | Phase |
|---------|------|------------------|----------|-------|
| 2. Multi-tenant data leak | Critical | Medium | P0 | 1 |
| 3. LGPD / dado sensível | Critical | High | P0 | 1 |
| 4. IA hallucination em saúde | Critical | Medium | P0 | 4 |
| 1. WhatsApp ban | Critical | High | P0 | 1+3 |
| 5. BullMQ stalled/OOM | High | Low | P1 | 1+3 |
| 6. Evolution API desconecta | High | Medium | P1 | 1+3 |
| 7. Prisma N+1 / indexes | High | Low | P1 | 1+2 |
| 8. Rate limit burst acidental | High | Medium | P1 | 3 |
| 9. Importação CSV corrompida | Medium-High | Medium | P2 | 2 |
| 10. Churn por não-uso | Medium-High | High | P2 | 5-6 |
| 11. Tenant ruidoso (starvation) | Medium | Low | P2 | 3 |
| 13. Fuso horário errado | Medium | Low | P2 | 3 |
| 14. Webhook mensagem perdida | Medium | Low | P2 | 1+4 |
| 12. API key Evolution exposta | Medium | Low | P2 | 1 |

---

## Phase-Specific Warnings

| Phase | Tópico | Pitfall mais provável | Mitigação antes de avançar |
|-------|--------|-----------------------|---------------------------|
| Phase 1 — Foundation | Multi-tenancy setup | Data leak via query sem tenant_id | Prisma extension com tenant context + suite de testes de isolamento em CI |
| Phase 1 — Foundation | BullMQ setup | Redis maxmemory-policy errada | Verificar `noeviction` antes de qualquer deploy |
| Phase 1 — Foundation | Evolution wrapper | Sessão desconecta silenciosamente | CONNECTION_UPDATE handler + health check desde o início |
| Phase 2 — CSV Import | Importação de base | Encoding e telefone inválido | normalizePhone() com cobertura de todos os formatos brasileiros + relatório de erros |
| Phase 3 — Campaign | Disparo em massa | WhatsApp ban | Typing indicator + delay aleatório + rate limit conservador + variação de texto obrigatória |
| Phase 3 — Campaign | Fila compartilhada | Tenant ruidoso monopoliza | Job groups ou fila por tenant desde o início — difícil de refatorar depois |
| Phase 4 — IA | IA conversacional | Guardrail bypassed | Filtro pós-resposta em código + adversarial test suite antes de qualquer piloto |
| Phase 4 — IA | Webhook | Mensagem perdida | respond-first pattern + idempotência por message ID |
| Phase 5 — Dashboard | Onboarding | Churn por não-uso | Onboarding ativo; templates de primeira campanha prontos antes de ativar clientes |

---

## Sources

- **BullMQ** (Context7 `/taskforcesh/bullmq`): documentação oficial sobre stalled jobs, rate limiting, Redis `noeviction`, graceful shutdown, `removeOnComplete`, `enableOfflineQueue` — HIGH confidence
- **Evolution API** (Context7 `/evolution-foundation/evolution-api` + `/evolution-foundation/docs-evolution`): documentação oficial sobre `CONNECTION_UPDATE`, instance management, webhook config, typing indicator (`sendPresence`), session logout — HIGH confidence
- **Prisma** (Context7 `/prisma/prisma`): documentação sobre extensions, N+1, connection pool, migrations — HIGH confidence
- **LGPD art. 11**: texto da lei disponível publicamente + interpretação baseada em guidelines ANPD — MEDIUM confidence (enforcement da ANPD ainda em maturação em 2026)
- **WhatsApp ban patterns**: comportamento documentado da Meta para WhatsApp Business API + padrões conhecidos de projetos Baileys em produção — MEDIUM confidence (Meta não documenta critérios exatos de ban publicamente)
- **SaaS churn para clínicas de saúde**: domain knowledge + padrões gerais de SaaS B2B small business — MEDIUM confidence
