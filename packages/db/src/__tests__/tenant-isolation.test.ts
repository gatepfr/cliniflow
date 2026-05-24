import { describe, it, expect } from 'vitest';
import { prisma, baseClient } from '../client.js';
import { tenantStorage } from '../context.js';
import { createId } from '@paralleldrive/cuid2';

async function createTestTenant(name: string) {
  return baseClient.tenant.create({
    data: { id: createId(), name },
  });
}

describe('Multi-tenant isolation', () => {
  it('Test A: throws [SECURITY] error when no tenant context is active', async () => {
    await expect(prisma.patient.findMany()).rejects.toThrow(
      '[SECURITY] Tenant context required'
    );
  });

  it('Test A variant: throws for create without context', async () => {
    await expect(
      prisma.patient.create({
        data: {
          id: createId(),
          tenantId: 'any',
          phoneNormalized: '+5543991234567',
          fullName: 'Test Patient',
        },
      })
    ).rejects.toThrow('[SECURITY] Tenant context required');
  });

  it('Test B: TenantB query never returns TenantA records', async () => {
    const tenantA = await createTestTenant(`Test Tenant A ${createId()}`);
    const tenantB = await createTestTenant(`Test Tenant B ${createId()}`);

    const userAId = createId();
    await baseClient.user.create({
      data: {
        id: userAId,
        tenantId: tenantA.id,
        email: `owner-a-${createId()}@test.clinicaflow`,
        passwordHash: 'hash',
        name: 'Owner A',
        role: 'owner',
      },
    });

    const ctxA = { tenantId: tenantA.id, userId: userAId };
    await tenantStorage.run(ctxA, async () => {
      await prisma.patient.create({
        data: {
          id: createId(),
          phoneNormalized: `+5543${Math.floor(Math.random() * 900000000 + 100000000)}`,
          fullName: 'Patient of TenantA',
        },
      });
    });

    const userBId = createId();
    await baseClient.user.create({
      data: {
        id: userBId,
        tenantId: tenantB.id,
        email: `owner-b-${createId()}@test.clinicaflow`,
        passwordHash: 'hash',
        name: 'Owner B',
        role: 'owner',
      },
    });

    const ctxB = { tenantId: tenantB.id, userId: userBId };
    const results = await tenantStorage.run(ctxB, async () => {
      return prisma.patient.findMany();
    });

    expect(results).toHaveLength(0);
    expect(results.find((p) => p.tenantId === tenantA.id)).toBeUndefined();
  });

  it('Test B variant: findUnique for tenantA record fails under tenantB context', async () => {
    const tenantA = await createTestTenant(`Test Tenant A2 ${createId()}`);
    const tenantB = await createTestTenant(`Test Tenant B2 ${createId()}`);

    const userAId = createId();
    await baseClient.user.create({
      data: {
        id: userAId,
        tenantId: tenantA.id,
        email: `ua2-${createId()}@test.clinicaflow`,
        passwordHash: 'hash',
        name: 'User A2',
        role: 'owner',
      },
    });

    const patientId = createId();
    await tenantStorage.run({ tenantId: tenantA.id, userId: userAId }, async () => {
      await prisma.patient.create({
        data: {
          id: patientId,
          phoneNormalized: `+5543${Math.floor(Math.random() * 900000000 + 100000000)}`,
          fullName: 'Isolated Patient',
        },
      });
    });

    const userBId = createId();
    await baseClient.user.create({
      data: {
        id: userBId,
        tenantId: tenantB.id,
        email: `ub2-${createId()}@test.clinicaflow`,
        passwordHash: 'hash',
        name: 'User B2',
        role: 'owner',
      },
    });

    const found = await tenantStorage.run({ tenantId: tenantB.id, userId: userBId }, async () => {
      return prisma.patient.findUnique({ where: { id: patientId } });
    });

    expect(found).toBeNull();
  });
});
