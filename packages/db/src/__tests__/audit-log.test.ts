import { describe, it, expect } from 'vitest';
import { prisma, baseClient } from '../client.js';
import { tenantStorage } from '../context.js';
import { createId } from '@paralleldrive/cuid2';

describe('Audit log — LGPD compliance', () => {
  it('Test C: patient.create generates audit_log row', async () => {
    const tenantId = createId();
    const userId = createId();

    await baseClient.tenant.create({ data: { id: tenantId, name: `Test Tenant Audit ${tenantId}` } });
    await baseClient.user.create({
      data: { id: userId, tenantId, email: `audit-${tenantId}@test.clinicaflow`, passwordHash: 'hash', name: 'Audit User', role: 'owner' },
    });

    const ctx = { tenantId, userId };

    await tenantStorage.run(ctx, async () => {
      await prisma.patient.create({
        data: {
          id: createId(),
          phoneNormalized: '+5543999123456',
          fullName: 'Audit Test Patient',
        },
      });
    });

    const log = await baseClient.auditLog.findFirst({
      where: { tenantId, userId, entity: 'Patient', action: 'create' },
      orderBy: { createdAt: 'desc' },
    });

    expect(log).not.toBeNull();
    expect(log?.tenantId).toBe(tenantId);
    expect(log?.userId).toBe(userId);
    expect(log?.entity).toBe('Patient');
    expect(log?.action).toBe('create');
    expect(log?.entityId).toBeTruthy();
  });

  it('Test C: audit_log metadata contains no PII fields', async () => {
    const tenantId = createId();
    const userId = createId();

    await baseClient.tenant.create({ data: { id: tenantId, name: `Test Tenant PII ${tenantId}` } });
    await baseClient.user.create({
      data: { id: userId, tenantId, email: `pii-${tenantId}@test.clinicaflow`, passwordHash: 'hash', name: 'PII User', role: 'owner' },
    });

    await tenantStorage.run({ tenantId, userId }, async () => {
      await prisma.patient.create({
        data: {
          id: createId(),
          phoneNormalized: '+5543987654321',
          fullName: 'PII Check Patient',
          birthDate: new Date('1985-06-15'),
        },
      });
    });

    const log = await baseClient.auditLog.findFirst({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });

    const metadata = log?.metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('full_name');
    expect(metadata).not.toHaveProperty('fullName');
    expect(metadata).not.toHaveProperty('phone_normalized');
    expect(metadata).not.toHaveProperty('phoneNormalized');
    expect(metadata).not.toHaveProperty('birth_date');
    expect(metadata).not.toHaveProperty('birthDate');
    expect(metadata).not.toHaveProperty('email');
  });

  it('audit_log contains required fields: action, entity, entity_id, user_id, tenant_id', async () => {
    const tenantId = createId();
    const userId = createId();

    await baseClient.tenant.create({ data: { id: tenantId, name: `Test Tenant Fields ${tenantId}` } });
    await baseClient.user.create({
      data: { id: userId, tenantId, email: `fields-${tenantId}@test.clinicaflow`, passwordHash: 'hash', name: 'Fields User', role: 'owner' },
    });

    await tenantStorage.run({ tenantId, userId }, async () => {
      await prisma.patient.create({
        data: { id: createId(), phoneNormalized: '+5543911111111', fullName: 'Fields Test' },
      });
    });

    const log = await baseClient.auditLog.findFirst({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });

    expect(log?.action).toBeDefined();
    expect(log?.entity).toBeDefined();
    expect(log?.entityId).toBeDefined();
    expect(log?.userId).toBe(userId);
    expect(log?.tenantId).toBe(tenantId);
  });
});
