import { Redis } from 'ioredis';

/**
 * Worker Redis connection.
 * REQUIRES maxRetriesPerRequest: null — without this, the worker process
 * crashes on any Redis reconnection (BullMQ Pitfall 6).
 */
export const workerConnection = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  maxRetriesPerRequest: null, // REQUIRED for BullMQ workers
  enableReadyCheck: false,
});

workerConnection.on('error', (err: Error) => {
  // Log Redis errors without PII
  console.error('[Worker Redis] Connection error:', err.message);
});

/**
 * Producer connection for DLQ (does NOT need maxRetriesPerRequest: null).
 */
export const dlqConnection = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
});

dlqConnection.on('error', (err: Error) => {
  // Log Redis errors without PII
  console.error('[DLQ Redis] Connection error:', err.message);
});
