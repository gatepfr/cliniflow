# Architecture Research: ClínicaFlow

**Domain:** SaaS multi-tenant WhatsApp + IA para clínicas de saúde
**Researched:** 2026-05-23
**Overall confidence:** HIGH (Context7 + official docs for all major patterns)

---

## Monorepo Setup

### Recommended: Turborepo + pnpm workspaces

Use Turborepo as the task orchestration layer on top of pnpm workspaces. pnpm handles dependency resolution; Turborepo handles build caching and task graph.

**Root `pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Root `package.json`:**
```json
{
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "type-check": "turbo run type-check"
  },
  "devDependencies": {
    "turbo": "latest"
  },
  "packageManager": "pnpm@9.0.0"
}
```

**`turbo.json` task graph:**
```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Package Structure

Each internal package uses the **Just-in-Time (JIT) strategy** for internal packages: export TypeScript source directly, let the consuming app's bundler compile it. No build step needed for shared packages during development.

```json
// packages/shared/package.json
{
  "name": "@clinicaflow/shared",
  "exports": {
    "./schemas": "./src/schemas/index.ts",
    "./types": "./src/types/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0"
  },
  "devDependencies": {
    "@clinicaflow/tsconfig": "workspace:*",
    "typescript": "latest"
  }
}
```

For packages consumed by external bundlers (like `packages/db` with Prisma), compile to `dist/`:
```json
// packages/db/package.json
{
  "name": "@clinicaflow/db",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

**Important (HIGH confidence):** Never do relative imports across package boundaries (`../../packages/ai/src/client`). Always install as workspace dep and import via package name (`@clinicaflow/ai`).

### Shared TypeScript Config

```json
// packages/tsconfig/base.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "paths": {}
  }
}

// packages/tsconfig/node.json (for api, worker)
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

### Build Order (enforced by Turborepo `^build`)

Turborepo resolves the dependency graph automatically. The logical order:

```
1. packages/tsconfig     (no deps)
2. packages/shared       (depends on tsconfig)
3. packages/db           (depends on shared, tsconfig)
4. packages/ai           (depends on shared, db)
5. packages/whatsapp     (depends on shared)
6. packages/billing      (depends on shared)
7. apps/api              (depends on db, ai, whatsapp, billing, shared)
8. apps/worker           (depends on db, ai, whatsapp, shared)
9. apps/web              (depends on shared)
```

`turbo run build` with `"dependsOn": ["^build"]` handles this automatically. Packages build before apps that consume them.

---

## Multi-Tenant Pattern

### Strategy: Row-level with Prisma Client Extension

Do not use raw middleware (removed in Prisma v7). Use **Client Extensions** (`$extends`) to intercept all queries and enforce `tenant_id` automatically.

**Tenant context via AsyncLocalStorage (Node.js native, zero deps):**

```typescript
// packages/db/src/tenant-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  tenantId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('No tenant context: call withTenant() first');
  return ctx.tenantId;
}

export function withTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}
```

**Prisma extension — auto-inject `tenant_id` and filter `deleted_at`:**

```typescript
// packages/db/src/client.ts
import { PrismaClient } from './generated/prisma';
import { getTenantId } from './tenant-context';

// Tables that do NOT have tenant_id (e.g., tenant itself)
const GLOBAL_TABLES = new Set(['tenant', 'audit_log']);

// Operations that write data (need tenant_id injection)
const WRITE_OPS = new Set(['create', 'createMany', 'upsert']);

// Operations that read data (need where filter)
const READ_OPS = new Set([
  'findUnique', 'findFirst', 'findMany',
  'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate',
]);

export const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (GLOBAL_TABLES.has(model)) return query(args);

        const tenantId = getTenantId();

        if (READ_OPS.has(operation)) {
          args.where = {
            ...args.where,
            tenant_id: tenantId,
            deleted_at: null,        // global soft-delete filter
          };
        }

        if (WRITE_OPS.has(operation)) {
          if (args.data) {
            args.data = { ...args.data, tenant_id: tenantId };
          }
        }

        return query(args);
      },
    },
  },
});

export type PrismaExtended = typeof prisma;
```

**Fastify middleware to establish tenant context:**

```typescript
// apps/api/src/plugins/tenant.plugin.ts
import fp from 'fastify-plugin';
import { withTenant } from '@clinicaflow/db/tenant-context';

export default fp(async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // Skip public routes
    if (request.routeOptions.config?.public) return;

    const tenantId = request.user?.tenantId; // set by JWT auth plugin
    if (!tenantId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Wrap handler execution in tenant context
    // Note: Fastify's hook system requires using AsyncLocalStorage.run() wrapping
    // the handler, which is done by replacing request.server.inject in onRequest
    request.tenantId = tenantId;
  });

  // Alternative: use a preHandler decorator that wraps the route handler
  app.decorateRequest('runWithTenant', function(fn: () => Promise<unknown>) {
    return withTenant(this.tenantId, fn);
  });
});
```

**CRITICAL constraint:** BullMQ workers also process tenant-specific data. Pass `tenant_id` explicitly in job data and call `withTenant(job.data.tenantId, () => processJob(job))` inside every worker processor. Never rely on request context in workers.

### Cross-Tenant Query Prevention

The extension above enforces `tenant_id` automatically on all reads and writes for scoped tables. Any raw SQL (`$queryRaw`, `$executeRaw`) bypasses this — mark all raw SQL usage with `// REVIEW: raw SQL, manually verified tenant_id filter` comment and add to security audit checklist.

Audit log writes always include both `tenant_id` AND `user_id` — the extension injects `tenant_id`, `user_id` must be added explicitly.

---

## Queue Architecture

### Five Queues, Separate Workers

Each queue has a dedicated worker processor. Run all workers in `apps/worker` as a single Node.js process (different Worker instances), or as separate pm2 processes in production.

```
Queue Name           | Purpose                              | Concurrency | Priority
---------------------|--------------------------------------|-------------|--------
webhook-evolution    | Receive & route WhatsApp events      | 50          | highest
ai-conversation      | Process inbound msg, generate reply  | 10          | high
campaign-dispatch    | Send campaign messages w/ rate limit | 5           | normal
appointment-confirm  | Send confirm reminders (48h / 3h)    | 10          | normal
recall-scheduler     | Daily cron to enqueue recalls        | 1           | low
```

### Queue Configuration Pattern

```typescript
// packages/shared/src/queues.ts
export const QUEUE_NAMES = {
  WEBHOOK_EVOLUTION: 'webhook-evolution',
  AI_CONVERSATION: 'ai-conversation',
  CAMPAIGN_DISPATCH: 'campaign-dispatch',
  APPOINTMENT_CONFIRM: 'appointment-confirm',
  RECALL_SCHEDULER: 'recall-scheduler',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 }, // keep failed 7 days
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // 2s → 4s → 8s
  },
};
```

### Dead Letter Queue (DLQ) Pattern

BullMQ has no native DLQ concept. The pattern is:

1. Set `removeOnFail: false` (or high count) so failed jobs are retained.
2. On `worker.on('failed')` event after max attempts exhausted (`job.attemptsMade >= job.opts.attempts`), move to a dedicated `dlq-*` queue with full job data + error info.
3. Monitor DLQ with Bull Board dashboard.

```typescript
// apps/worker/src/dlq.ts
import { Queue } from 'bullmq';
import { redisConnection } from './redis';

const dlqQueues: Record<string, Queue> = {};

export function getDLQ(originalQueue: string): Queue {
  if (!dlqQueues[originalQueue]) {
    dlqQueues[originalQueue] = new Queue(`dlq-${originalQueue}`, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false, // keep DLQ jobs indefinitely until manually handled
      },
    });
  }
  return dlqQueues[originalQueue];
}

// In each worker:
worker.on('failed', async (job, err) => {
  if (!job) return;
  const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (isExhausted) {
    await getDLQ(queueName).add('failed-job', {
      originalQueue: queueName,
      jobName: job.name,
      jobData: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
    });
  }
});
```

### Retry Policy Per Queue

| Queue | Attempts | Backoff | Rationale |
|-------|----------|---------|-----------|
| webhook-evolution | 5 | exponential 1s | Must not lose webhook events |
| ai-conversation | 3 | exponential 2s | Claude API transient errors |
| campaign-dispatch | 3 | exponential 5s | WhatsApp API flakiness |
| appointment-confirm | 5 | exponential 60s | Critical for no-show reduction |
| recall-scheduler | 1 | none | Cron; re-runs next day on failure |

### Cron for recall-scheduler

```typescript
// apps/worker/src/workers/recall-scheduler.worker.ts
import { Queue } from 'bullmq';

// Add repeatable job on worker startup
await recallQueue.add(
  'daily-recall',
  {},
  {
    repeat: {
      pattern: '0 6 * * *', // 6am UTC = 3am Brasília (before business hours)
      tz: 'America/Sao_Paulo',
    },
    removeOnComplete: true,
    attempts: 1,
  },
);
```

---

## Webhook Handler Pattern

### Core Principle: Accept → Queue → Acknowledge → Process Async

The Evolution API webhook fires on every WhatsApp event (message received, message status update, connection status, etc.). The handler must return 200 in <2s or Evolution will retry.

```typescript
// apps/api/src/routes/webhooks/evolution.route.ts
import { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import crypto from 'node:crypto';

export async function evolutionWebhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { tenantId: string } }>(
    '/webhooks/evolution/:tenantId',
    {
      config: { public: true }, // skip tenant middleware
      schema: { hide: true },   // hide from OpenAPI docs
    },
    async (request, reply) => {
      // 1. Verify signature immediately (fast, synchronous)
      const signature = request.headers['x-evolution-signature'] as string;
      if (!isValidSignature(request.rawBody, signature)) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // 2. Validate tenant exists (optional: cache tenant lookup)
      const { tenantId } = request.params;

      // 3. Enqueue for async processing
      await webhookQueue.add('evolution-event', {
        tenantId,
        event: request.body,
        receivedAt: Date.now(),
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });

      // 4. Return 200 immediately — Evolution won't retry
      return reply.code(200).send({ ok: true });
    },
  );
}

function isValidSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET!;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}
```

**Requirement:** Fastify must be configured with `addContentTypeParser` to preserve `rawBody` for HMAC verification:
```typescript
app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  req.rawBody = body;
  done(null, JSON.parse(body.toString()));
});
```

### Webhook Worker: Event Router

The webhook worker receives all events and routes to the appropriate downstream queue:

```typescript
// apps/worker/src/workers/webhook-evolution.worker.ts
const webhookWorker = new Worker(
  QUEUE_NAMES.WEBHOOK_EVOLUTION,
  async (job) => {
    const { tenantId, event } = job.data;
    const eventType = event.event; // 'messages.upsert' | 'messages.update' | 'connection.update'

    await withTenant(tenantId, async () => {
      switch (eventType) {
        case 'messages.upsert':
          // New inbound message → route to AI conversation
          if (isInboundMessage(event)) {
            await aiConversationQueue.add('process-message', {
              tenantId,
              message: event.data,
            });
          }
          break;

        case 'messages.update':
          // Status update (delivered/read) → update message record
          await updateMessageStatus(event.data);
          break;

        case 'connection.update':
          // WhatsApp connection status → notify tenant if disconnected
          await handleConnectionUpdate(tenantId, event.data);
          break;
      }
    });
  },
  {
    connection: redisConnection,
    concurrency: 50,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
);
```

---

## AI Integration Pattern

### `packages/ai/src/client.ts` — Single Entry Point

All AI calls flow through this module. No direct Anthropic SDK calls from other packages.

```typescript
// packages/ai/src/client.ts
import Anthropic from '@anthropic-ai/sdk';
import { GuardrailViolation, GuardrailResult } from './guardrails';
import { faqCache } from './cache';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type AIModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6';

export interface AICallOptions {
  model: AIModel;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  tenantId: string; // for audit logging, never logged to external services
}

export interface AICallResult {
  content: string;
  guardrail: GuardrailResult;
  inputTokens: number;
  outputTokens: number;
}

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const { model, systemPrompt, messages, maxTokens = 500, tenantId } = options;

  // FAQ cache check: skip AI call for common questions
  const cachedResponse = await faqCache.get(messages.at(-1)?.content ?? '');
  if (cachedResponse) {
    return {
      content: cachedResponse,
      guardrail: { passed: true, violations: [] },
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  const content = response.content[0].type === 'text'
    ? response.content[0].text
    : '';

  // Post-response guardrail check (always runs, never bypass)
  const guardrail = checkGuardrails(content);

  return {
    content,
    guardrail,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
```

### Guardrails

Guardrails run on **every** AI response before it can be sent to the patient. Violations escalate to human — the message is never sent.

```typescript
// packages/ai/src/guardrails.ts

// HIGH confidence: these patterns catch the most common violations
// Expand this list as violations are observed in production
const MEDICAL_ADVICE_PATTERNS = [
  /diagnos/i,
  /prescrever|prescri[çc][aã]o/i,
  /medicament[oa]/i,
  /sintoma.*(indica|sugere|aponta)/i,
  /tratamento.*(recomend|indica)/i,
  /\b(antibiótico|anestesia|analgésico)\b/i,
  /cura garantida|resultado garantido/i,
  /com certeza (vai|irá) melhorar/i,
];

const PRICE_WITHOUT_FALLBACK_PATTERN = /R\$\s*\d+/;

export interface GuardrailResult {
  passed: boolean;
  violations: GuardrailViolation[];
}

export interface GuardrailViolation {
  type: 'medical_advice' | 'price_without_fallback' | 'treatment_promise';
  pattern: string;
  excerpt: string;
}

export function checkGuardrails(content: string): GuardrailResult {
  const violations: GuardrailViolation[] = [];

  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({
        type: 'medical_advice',
        pattern: pattern.source,
        excerpt: content.substring(0, 100),
      });
    }
  }

  // Price mention only allowed if FAQ explicitly covers pricing
  // This check is done externally based on ai_config.faq_content
  // The guardrail here is a safety net for unexpected price quotes
  if (PRICE_WITHOUT_FALLBACK_PATTERN.test(content) && !content.includes('confirmar')) {
    violations.push({
      type: 'price_without_fallback',
      pattern: PRICE_WITHOUT_FALLBACK_PATTERN.source,
      excerpt: content.substring(0, 100),
    });
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
```

### AI Worker Usage

```typescript
// apps/worker/src/workers/ai-conversation.worker.ts
const aiWorker = new Worker(
  QUEUE_NAMES.AI_CONVERSATION,
  async (job) => {
    const { tenantId, message } = job.data;

    await withTenant(tenantId, async () => {
      const conversation = await getOrCreateConversation(message.phone);

      // Check turn limit (cost control: max 8 turns)
      if (conversation.turnCount >= 8) {
        await handoffToHuman(conversation.id, 'turn_limit_exceeded');
        return;
      }

      // Check idle timeout (24h = close conversation)
      const idleHours = (Date.now() - conversation.lastMessageAt) / 3600000;
      if (idleHours >= 24) {
        await closeConversation(conversation.id, 'idle_timeout');
        return;
      }

      const aiConfig = await getAIConfig(tenantId);
      const systemPrompt = buildSystemPrompt(aiConfig);

      // First turn: use Haiku for triage
      // Subsequent turns: use Sonnet for nuanced conversation
      const model = conversation.turnCount === 0
        ? 'claude-haiku-4-5'
        : 'claude-sonnet-4-6';

      const result = await callAI({
        model,
        systemPrompt,
        messages: await getConversationHistory(conversation.id),
        tenantId,
      });

      if (!result.guardrail.passed) {
        // Guardrail violation: escalate to human, never send AI response
        await handoffToHuman(conversation.id, 'guardrail_violation', {
          violations: result.guardrail.violations,
        });
        // Send a safe fallback message to patient
        await sendMessage(message.phone, aiConfig.humanHandoffMessage);
        return;
      }

      await saveAndSendMessage(conversation.id, result.content);
      await incrementTurnCount(conversation.id);
    });
  },
  { connection: redisConnection, concurrency: 10 },
);
```

### Prompt Template

```typescript
// packages/ai/src/prompts.ts
import type { AIConfig } from '@clinicaflow/db';

export function buildSystemPrompt(config: AIConfig, patientContext?: {
  lastVisit?: Date;
  openTreatment?: string;
}): string {
  return `
[IDENTIDADE]
Você é a assistente virtual da ${config.clinicName}, especializada em ${config.specialty}.
Seu nome é ${config.assistantName ?? 'Assistente'}.

[TOM DE VOZ]
${config.tone === 'formal' ? 'Use linguagem formal e respeitosa.' : ''}
${config.tone === 'informal' ? 'Use linguagem amigável e descontraída, como uma recepcionista simpática.' : ''}

[RESTRIÇÕES INEGOCIÁVEIS — NUNCA VIOLE]
- NUNCA dê diagnóstico, opinião clínica, prescrição ou avalie sintomas
- NUNCA prometa resultado de tratamento ou cura
- NUNCA informe preço a não ser que esteja explicitamente no FAQ abaixo
- Se o paciente mencionar dor forte, sangramento, emergência ou urgência, transfira IMEDIATAMENTE para um humano
- Se não souber responder, diga que vai verificar com a equipe

[OBJETIVO]
Acolher o paciente, entender o interesse, responder dúvidas usando o FAQ, e agendar uma consulta.

[FAQ DA CLÍNICA]
${config.faqContent}

[CONTEXTO DO PACIENTE]
${patientContext?.lastVisit ? `Última visita: ${patientContext.lastVisit.toLocaleDateString('pt-BR')}` : ''}
${patientContext?.openTreatment ? `Tratamento em andamento: ${patientContext.openTreatment}` : ''}

[PALAVRAS-GATILHO PARA TRANSFERÊNCIA]
Se o paciente mencionar qualquer um destes termos, transfira imediatamente:
${config.triggerWordsHandoff.join(', ')}
`.trim();
}
```

### FAQ Response Cache

```typescript
// packages/ai/src/cache.ts — simple Redis-based FAQ cache
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);
const CACHE_TTL = 3600; // 1 hour — FAQ answers are stable
const SIMILARITY_THRESHOLD = 0.9; // for future semantic matching

export const faqCache = {
  async get(question: string): Promise<string | null> {
    // Simple exact match first (covers greetings, common questions)
    const key = `faq:${Buffer.from(question.toLowerCase().trim()).toString('base64')}`;
    return redis.get(key);
  },

  async set(question: string, answer: string): Promise<void> {
    const key = `faq:${Buffer.from(question.toLowerCase().trim()).toString('base64')}`;
    await redis.setex(key, CACHE_TTL, answer);
  },
};
```

Note: Cache key is based on exact normalized question. For the MVP, this is sufficient to cache greetings ("oi", "olá", "bom dia") and exact FAQ questions. Semantic similarity caching (vector embeddings) is a phase 2 optimization.

---

## Rate Limiting Pattern

### Critical Finding: BullMQ OSS vs BullMQ Pro

**BullMQ open-source (v3+) removed per-group/per-key rate limiting.** The `limiter.groupKey` option is deprecated and removed. Per-number rate limiting with the BullMQ Pro `WorkerPro` group feature costs money (paid license).

**Recommended approach for ClínicaFlow (free, robust):** Two-layer rate limiting using BullMQ global limiter + Redis sliding window counter per WhatsApp number.

### Layer 1: Global Queue Rate Limiter (BullMQ built-in)

Cap the total throughput of the campaign-dispatch worker as a safety net:

```typescript
const campaignWorker = new Worker(
  QUEUE_NAMES.CAMPAIGN_DISPATCH,
  processCampaignJob,
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 25,       // max 25 jobs per second globally across all workers
      duration: 1000, // across all WhatsApp numbers combined
    },
  },
);
```

### Layer 2: Per-Number Redis Sliding Window (enforced inside job processor)

```typescript
// packages/whatsapp/src/rate-limiter.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

const LIMITS = {
  perMinute: 30,   // max 30 msgs/min per number
  perDay: 1000,    // max 1000 msgs/day per number
};

export async function checkAndConsumeRateLimit(
  phoneNumber: string,  // the WhatsApp sender number
): Promise<{ allowed: boolean; waitMs?: number }> {
  const now = Date.now();
  const minuteKey = `rl:min:${phoneNumber}:${Math.floor(now / 60000)}`;
  const dayKey = `rl:day:${phoneNumber}:${new Date().toISOString().substring(0, 10)}`;

  const pipeline = redis.pipeline();
  pipeline.incr(minuteKey);
  pipeline.expire(minuteKey, 120); // 2 min TTL to handle minute boundary
  pipeline.incr(dayKey);
  pipeline.expire(dayKey, 86400 + 3600); // 25h TTL
  const results = await pipeline.exec();

  const minuteCount = results![0]![1] as number;
  const dayCount = results![2]![1] as number;

  if (dayCount > LIMITS.perDay) {
    // Daily limit: wait until next day
    const nextDay = new Date();
    nextDay.setHours(24, 0, 0, 0);
    return { allowed: false, waitMs: nextDay.getTime() - now };
  }

  if (minuteCount > LIMITS.perMinute) {
    // Minute limit: wait until next minute
    const nextMinute = (Math.floor(now / 60000) + 1) * 60000;
    return { allowed: false, waitMs: nextMinute - now };
  }

  return { allowed: true };
}
```

### Campaign Dispatch Worker with Rate Limiting

```typescript
// apps/worker/src/workers/campaign-dispatch.worker.ts
import { Worker } from 'bullmq';
import { checkAndConsumeRateLimit } from '@clinicaflow/whatsapp/rate-limiter';
import { sendWhatsAppMessage } from '@clinicaflow/whatsapp/client';

const campaignWorker = new Worker(
  QUEUE_NAMES.CAMPAIGN_DISPATCH,
  async (job) => {
    const { tenantId, patientPhone, messageContent, whatsappNumber, campaignId, messageId } = job.data;

    const { allowed, waitMs } = await checkAndConsumeRateLimit(whatsappNumber);

    if (!allowed) {
      // Re-queue the job with a delay (back to waiting state)
      await worker.rateLimit(waitMs!);
      throw Worker.RateLimitError();
    }

    // Randomized human-like delay (5-15s between messages per business rules)
    const humanDelay = 5000 + Math.random() * 10000;
    await sleep(humanDelay);

    // Business hours check
    const clinicTz = await getClinicTimezone(tenantId);
    if (!isWithinBusinessHours(clinicTz)) {
      // Delay to next business day 9am
      const nextWindow = getNextBusinessHourMs(clinicTz);
      await job.moveToDelayed(Date.now() + nextWindow);
      return;
    }

    await withTenant(tenantId, async () => {
      await sendWhatsAppMessage(whatsappNumber, patientPhone, messageContent);
      await updateMessageStatus(messageId, 'sent');
    });
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: { max: 25, duration: 1000 },
  },
);
```

### Daily Limit Monitoring

Persist `daily_messages_sent` in the `whatsapp_instance` table (or a Redis key mirrored to Postgres) so the dashboard can show current utilization vs. the 1000/day cap.

---

## Data Flow: Campaign Lifecycle End-to-End

```
[1] CAMPAIGN CREATION (API)
    Dentist fills campaign editor in React UI
    → POST /api/campaigns
    → Validate segment_filter, template, schedule_config (Zod)
    → Save campaign with status='draft' in Postgres
    → Return campaign ID

[2] CAMPAIGN ACTIVATION (API)
    Dentist clicks "Disparar" / schedule time arrives
    → POST /api/campaigns/:id/start
    → Query patients matching segment_filter (scoped to tenant_id)
    → For each patient:
        → Enqueue job in campaign-dispatch queue with:
           { tenantId, patientId, patientPhone, campaignId, messageId }
    → Update campaign status='running'
    → Record campaign.started_at

[3] MESSAGE PERSONALIZATION (Worker: campaign-dispatch)
    Worker picks up each job
    → Load patient data (name, last_visit_at, open_treatment)
    → Interpolate template variables: {{nome}}, {{ultima_visita}}
    → Call callAI(model: 'claude-haiku-4-5') to rewrite with clinic tone
    → Guardrail check on AI output
    → If guardrail fails: log, skip message, notify admin
    → Rate limit check (per-number sliding window)
    → If rate limited: re-queue with delay
    → Business hours check: if outside window, delay to next opening
    → Human-like delay (5-15s random)
    → Send via Evolution API wrapper
    → Update message.status = 'sent', message.sent_at = now()

[4] DELIVERY CONFIRMATION (Evolution → Webhook)
    Evolution API fires POST /webhooks/evolution/:tenantId
    → Handler: verify signature → enqueue in webhook-evolution → return 200
    
    webhook-evolution worker:
    → Detect event type 'messages.update'
    → Extract messageId + status (delivered/read)
    → Update message.status, message.delivered_at / message.read_at
    → If campaign fully sent: update campaign.status = 'completed', campaign.finished_at

[5] PATIENT RESPONSE (Evolution → Webhook → AI)
    Patient replies to the WhatsApp message
    → Evolution fires 'messages.upsert' webhook
    → webhook-evolution worker detects inbound message
    → Looks up open conversation for this patient (or creates new one)
    → Enqueues job in ai-conversation queue

    ai-conversation worker:
    → Load conversation history (max last N messages for context)
    → Check turn limit (8 max) and idle timeout (24h)
    → Build system prompt from ai_config
    → First turn → Haiku; subsequent → Sonnet
    → callAI() → guardrail check
    → If guardrail violation → handoffToHuman() + safe fallback message
    → Save chat_message (in=patient, out=AI)
    → Send AI response via Evolution API
    → Check if AI scheduled appointment → create appointment record

[6] APPOINTMENT CREATION (AI Worker or API)
    AI determines patient wants to schedule
    → Parse appointment intent (date/time if mentioned)
    → Create appointment with status='scheduled', source='ai'
    → Enqueue appointment-confirm job with delay:
        - 48h before: delay = (scheduledAt - 48h - now)
        - 3h before: delay = (scheduledAt - 3h - now)

[7] APPOINTMENT CONFIRMATION (Worker: appointment-confirm)
    Job fires at T-48h and T-3h
    → Load appointment + patient data
    → Send confirmation WhatsApp via Evolution API
    → If patient confirms → update status='confirmed'
    → If patient cancels → offer reschedule via AI conversation
    → If no response to T-3h reminder → flag as 'at_risk'

[8] ROI TRACKING (Dashboard)
    appointment.status changes to 'completed' (manual or integration)
    → ROI = COUNT(appointments completed where source='ai') × tenant.ticket_medio_cents
    → Dashboard query aggregates this per month
    → Export PDF triggers on-demand calculation
```

---

## Build Order (Phase Implications)

The architecture has hard dependencies that constrain phase ordering:

### Phase 1 Must Deliver (everything else depends on it)
1. **Monorepo scaffold** — Turborepo + pnpm workspaces, shared tsconfig, ESLint/Prettier
2. **`packages/db`** — Prisma schema, migrations, Prisma client with tenant extension
3. **`packages/shared`** — Zod schemas, shared types, queue names, error classes
4. **Auth system** — JWT + refresh tokens, Fastify auth plugin
5. **Tenant middleware** — AsyncLocalStorage context + Prisma extension working together
6. **Redis + BullMQ bootstrap** — connection factory, worker runner harness

Until these 6 items exist, no other work can proceed safely.

### Phase 2 can start after Phase 1
7. **CSV importer** — needs `packages/db` (patient model) and `packages/shared` (Zod schemas)
8. **Evolution API wrapper** (`packages/whatsapp`) — needs queue infrastructure
9. **Campaign editor** (React UI) — needs `packages/shared` types, independent of backend details

### Phase 3 depends on Phase 1 + Evolution wrapper
10. **campaign-dispatch worker** — needs `packages/whatsapp` + rate limiter + `packages/ai`
11. **`packages/ai`** — can be started after Phase 1 (independent of Evolution)
12. **webhook-evolution route + worker** — needs Evolution wrapper + BullMQ

### Phase 4 depends on Phase 3
13. **ai-conversation worker** — needs webhook infrastructure + `packages/ai`
14. **appointment-confirm worker** — needs appointment model + BullMQ delayed jobs

### Phase 5 depends on Phase 3 + 4
15. **Dashboard / ROI** — needs complete data pipeline from campaign → appointment

### Parallel Work Opportunities
- `packages/ai` can be developed independently of `packages/whatsapp`
- React frontend (`apps/web`) can start building UI components with mocked API responses
- Billing integration (`packages/billing`) can be done anytime in Phase 2-3

---

## Key Architectural Decisions Confirmed

| Decision | Pattern | Confidence | Source |
|----------|---------|------------|--------|
| Prisma multi-tenant | `$extends` with `$allModels.$allOperations` | HIGH | Prisma v7 official docs |
| Tenant context | `AsyncLocalStorage` (Node.js native) | HIGH | Node.js standard |
| BullMQ per-number rate limit | Redis sliding window (not BullMQ Pro groups) | HIGH | BullMQ docs: groupKey removed in v3 |
| Webhook handling | Fire-and-forget → queue, return 200 synchronously | HIGH | BullMQ + Fastify patterns |
| Turbo build order | `dependsOn: ["^build"]` with workspace deps | HIGH | Turborepo official docs |
| DLQ | `worker.on('failed')` → move to `dlq-*` queue | MEDIUM | BullMQ community pattern |
| AI guardrails | Post-response regex filter, never bypass | HIGH | Project requirement |
| FAQ cache | Redis exact-match, TTL 1h | MEDIUM | Standard caching pattern |

## Pitfall Flags

- **`withTenant()` in workers:** Forgetting this causes cross-tenant contamination. Every worker processor must wrap execution in `withTenant(job.data.tenantId, ...)`.
- **rawBody for HMAC:** Fastify parses body by default, destroying the raw bytes needed for signature verification. Must configure content type parser before route registration.
- **BullMQ Pro vs OSS:** Per-group rate limiting requires BullMQ Pro (paid). The Redis sliding window approach documented here is the correct free alternative.
- **Prisma `$allModels` extension caveat:** The extension filters `deleted_at: null` globally — any legitimate query to fetch soft-deleted records (e.g., admin audit view) must use `$queryRaw` with explicit bypass logic.
- **Evolution API connection pool:** In Starter plan (shared pool), multiple tenants share WhatsApp numbers. The `whatsappNumber` field in job data must reflect the actual sender, not the tenant. Rate limit keys must use the actual number, not tenant ID.
- **Turn counter race condition:** Concurrent AI responses for the same conversation can bypass the 8-turn limit. Use a Postgres advisory lock or Redis atomic counter (INCR) for `conversation.turn_count`, not a read-then-write pattern.
