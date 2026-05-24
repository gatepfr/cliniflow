import * as Sentry from '@sentry/node';
import { Worker, Queue } from 'bullmq';
import pino from 'pino';
import { QUEUE_NAMES } from '@clinicaflow/shared';
import { workerConnection, dlqConnection } from './lib/redis.js';
import { processCampaignDispatch } from './queues/campaign-dispatch.js';
import { processAiConversation } from './queues/ai-conversation.js';
import { processAppointmentConfirm } from './queues/appointment-confirm.js';
import { processRecallScheduler } from './queues/recall-scheduler.js';
import { processWebhookEvolution } from './queues/webhook-evolution.js';

if (process.env['SENTRY_DSN']) {
  Sentry.init({ dsn: process.env['SENTRY_DSN'] });
}

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

// DLQ for failed jobs — storage only, no processor
const dlq = new Queue(QUEUE_NAMES.DEAD_LETTER, { connection: dlqConnection });

/**
 * Exponential backoff: 1s → 2s → 4s… capped at 30s (D-10).
 */
function exponentialBackoff(attemptsMade: number): number {
  return Math.min(1000 * Math.pow(2, attemptsMade - 1), 30_000);
}

/**
 * Creates a BullMQ worker with retry/DLQ pattern per D-10.
 * Note: defaultJobOptions belongs on Queue (producer), not Worker (consumer).
 * Retry policy is enforced via the Queue when jobs are enqueued.
 * The worker respects whatever opts were set at enqueue time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createWorker(
  queueName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: (job: import('bullmq').Job<any>) => Promise<void>,
  concurrency: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Worker<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker = new Worker<any>(queueName, processor, {
    connection: workerConnection,
    concurrency,
    settings: {
      backoffStrategy: exponentialBackoff,
    },
  });

  worker.on('failed', (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      // Move to DLQ (D-10) — job.data contains only IDs, no PII (LGPD art. 11)
      void dlq.add(`dlq_${queueName}`, {
        originalQueue: queueName,
        jobId: job.id,
        jobName: job.name,
        data: job.data,
        error: err.message,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
        // stacktrace intentionally omitted — may contain path info
      });

      // Report to Sentry — no PII in extra payload (T-1-PLAN07-02)
      Sentry.captureException(err, {
        extra: {
          jobId: job.id,
          queue: queueName,
          attemptsMade: job.attemptsMade,
        },
      });

      logger.error(
        { jobId: job.id, queue: queueName, err: err.message },
        'Job moved to DLQ after max retries',
      );
    }
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, `Worker error on queue ${queueName}`);
  });

  logger.info({ queue: queueName, concurrency }, 'Worker started');
  return worker;
}

// Start all 5 workers — D-08 (single process), D-09 (concurrency per queue)
createWorker(QUEUE_NAMES.CAMPAIGN_DISPATCH, processCampaignDispatch, 5);
createWorker(QUEUE_NAMES.AI_CONVERSATION, processAiConversation, 10);
createWorker(QUEUE_NAMES.APPOINTMENT_CONFIRM, processAppointmentConfirm, 3);
createWorker(QUEUE_NAMES.RECALL_SCHEDULER, processRecallScheduler, 1);
createWorker(QUEUE_NAMES.WEBHOOK_EVOLUTION, processWebhookEvolution, 20);

logger.info('All 5 BullMQ workers started');

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down workers...');
  // DLQ queue and connections need explicit close
  await dlq.close();
  await dlqConnection.quit();
  await workerConnection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
