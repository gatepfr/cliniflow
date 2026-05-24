import { baseClient } from '../client.js';

beforeAll(async () => {
  await baseClient.$connect();
});

afterAll(async () => {
  // Cleanup order matters: child records before parents (foreign key constraints).
  // Delete audit logs first (reference user + tenant), then patients, users, tenants.
  // Using @test.clinicaflow email domain as the marker for test-created records.
  const testUsers = await baseClient.user.findMany({
    where: { email: { contains: '@test.clinicaflow' } },
    select: { id: true, tenantId: true },
  });
  const testTenantIds = [...new Set(testUsers.map((u) => u.tenantId))];

  if (testTenantIds.length > 0) {
    // Delete in dependency order: audit_log → patient → user → tenant
    await baseClient.auditLog.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await baseClient.patient.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await baseClient.user.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await baseClient.tenant.deleteMany({ where: { id: { in: testTenantIds } } });
  }

  await baseClient.$disconnect();
});
