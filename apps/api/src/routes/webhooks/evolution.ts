import type { FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { verifyEvolutionWebhook, extractWebhookJobData } from '@clinicaflow/whatsapp';
import { QUEUE_NAMES, AppError } from '@clinicaflow/shared';

// Producer connection (NOT maxRetriesPerRequest: null — that's for workers only)
const producerConnection = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
});

const webhookQueue = new Queue(QUEUE_NAMES.WEBHOOK_EVOLUTION, {
  connection: producerConnection,
});

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/evolution/:tenantId', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const expectedApiKey = process.env['EVOLUTION_API_KEY'];

    if (!expectedApiKey) {
      throw new AppError('CONFIG_ERROR', 'EVOLUTION_API_KEY not configured', 500);
    }

    const isValid = verifyEvolutionWebhook(request.body, expectedApiKey);
    if (!isValid) {
      // Log without PII or apikey value (T-1-05)
      request.log.warn({ tenantId }, 'Rejected Evolution webhook: invalid apikey');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Return 200 IMMEDIATELY — never await the queue add (WA-04)
    void reply.code(200).send({ ok: true });

    // Enqueue for async processing — extractWebhookJobData omits body.data (LGPD, T-1-PLAN06-03)
    const payload = request.body as Parameters<typeof extractWebhookJobData>[0];
    void webhookQueue.add(
      'evolution-event',
      {
        ...extractWebhookJobData(payload),
        tenantId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 24 * 3600 },
      },
    );
  });
};
