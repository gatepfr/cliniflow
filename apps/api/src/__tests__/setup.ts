import { redis } from '../lib/redis.js';
import { baseClient } from '@clinicaflow/db';

beforeAll(async () => {
  await baseClient.$connect();
  await redis.connect();
});

afterAll(async () => {
  // Clean up test data in dependency order (foreign keys)
  const testUsers = await baseClient.user.findMany({
    where: { email: { contains: '@apitest.clinicaflow' } },
    select: { id: true, tenantId: true },
  });
  const testTenantIds = [...new Set(testUsers.map((u) => u.tenantId))];

  if (testTenantIds.length > 0) {
    await baseClient.auditLog.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await baseClient.patient.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await baseClient.user.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await baseClient.tenant.deleteMany({ where: { id: { in: testTenantIds } } });
  }

  await baseClient.$disconnect();
  await redis.quit();
});
