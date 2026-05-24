import IORedis from 'ioredis';

export const redis = new IORedis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  // For the API (producer), use default maxRetriesPerRequest (fail fast)
  // Workers use maxRetriesPerRequest: null (see apps/worker)
  lazyConnect: true,
});

redis.on('error', (err) => {
  // Log Redis connection errors without PII
  console.error('[Redis] Connection error:', err.message);
});
