import { describe, it, expect, afterAll } from 'vitest';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES } from '@clinicaflow/shared';

// Use Redis DB index 15 for tests to avoid polluting dev data
const testRedisConnection = new IORedis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  db: 15,
  maxRetriesPerRequest: null,
});

afterAll(async () => {
  await testRedisConnection.flushdb();
  await testRedisConnection.quit();
});

describe('BullMQ queue smoke tests', () => {
  it.each([
    QUEUE_NAMES.CAMPAIGN_DISPATCH,
    QUEUE_NAMES.AI_CONVERSATION,
    QUEUE_NAMES.APPOINTMENT_CONFIRM,
    QUEUE_NAMES.RECALL_SCHEDULER,
    QUEUE_NAMES.WEBHOOK_EVOLUTION,
  ])('Queue %s: job is picked up and processed', async (queueName) => {
    const queue = new Queue(queueName, { connection: testRedisConnection });

    let processedJobId: string | undefined;

    const worker = new Worker(
      queueName,
      async (job) => {
        processedJobId = job.id;
      },
      {
        connection: testRedisConnection,
        concurrency: 1,
      }
    );

    await queue.add('smoke-test', { test: true, queueName });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Queue ${queueName} job not processed within 10s`)),
        10_000
      );
      worker.on('completed', () => {
        clearTimeout(timeout);
        resolve();
      });
      worker.on('failed', (_job, err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    expect(processedJobId).toBeDefined();

    await worker.close();
    await queue.close();
  });
});
