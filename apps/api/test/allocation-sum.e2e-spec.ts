import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * The allocation-sum constraint is in Playbook §10's "must have thorough tests"
 * tier: it is the invariant the whole reconciliation module rests on, and it is
 * enforced in two places that must agree — the service's Decimal arithmetic and
 * the `trg_check_allocation_sum` trigger's FOR UPDATE check.
 *
 * These run against a real Postgres because the trigger is the point. Mocking
 * Prisma here would test nothing that matters.
 */
describe('Allocation sum constraint (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let accountId: string;
  let categoryId: string;
  let branchId: string;

  // Allocation endpoints are ADMIN/OWNER only (ADR-011 §6), so every request
  // here carries a real session rather than bypassing the guard.
  const adminEmail = 'alloc-admin@test.local';
  const adminPassword = 'TestPass123!';
  let adminCookies: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new PostgresTriggerExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const account = await prisma.account.create({
      data: { name: 'Test Bank', type: 'BANK' },
    });
    const category = await prisma.category.create({
      data: { name: 'Test Income', type: 'INFLOW' },
    });
    const branch = await prisma.branch.create({
      data: { name: 'Test Branch' },
    });

    accountId = account.id;
    categoryId = category.id;
    branchId = branch.id;

    await prisma.user.create({
      data: {
        name: 'Alloc Admin',
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: 'ADMIN',
        tokenValidFrom: new Date(),
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminCookies = loginRes.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await prisma.allocation.deleteMany({});
    await prisma.bankTransaction.deleteMany({});
    await prisma.payableSettlement.deleteMany({});
    await prisma.payable.deleteMany({});
    await prisma.supplierPurchaseItem.deleteMany({});
    await prisma.supplierPurchase.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
  });

  async function makePair(txnAmount: string, entryAmount: string) {
    const txn = await prisma.bankTransaction.create({
      data: {
        accountId,
        txnDate: new Date('2026-02-01'),
        amount: txnAmount,
        type: 'INFLOW',
        description: 'test deposit',
      },
    });
    const entry = await prisma.ledgerEntry.create({
      data: {
        accountId,
        categoryId,
        branchId,
        entryDate: new Date('2026-02-01'),
        amount: entryAmount,
        type: 'INFLOW',
      },
    });
    return { txn, entry };
  }

  it('accepts an allocation up to exactly the transaction amount', async () => {
    const { txn, entry } = await makePair('100.00', '100.00');

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '100.00',
      })
      .expect(201);

    const updated = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id: txn.id },
    });
    expect(updated.status).toBe('MATCHED');
  });

  it('rejects an allocation that would exceed the transaction amount', async () => {
    const { txn, entry } = await makePair('100.00', '200.00');

    const res = await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '100.01',
      })
      .expect(400);

    const body = res.body as { message: string };
    expect(body.message).toMatch(/exceed/i);
    expect(await prisma.allocation.count()).toBe(0);
  });

  it('rejects the cumulative total crossing the cap across separate calls', async () => {
    const { txn, entry } = await makePair('100.00', '100.00');

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '60.00',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '40.01',
      })
      .expect(400);

    const remaining = await prisma.allocation.findMany();
    expect(remaining).toHaveLength(1);
  });

  it('sets PARTIALLY_ALLOCATED when the allocation is under the amount', async () => {
    const { txn, entry } = await makePair('100.00', '100.00');

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '40.00',
      })
      .expect(201);

    const updated = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id: txn.id },
    });
    expect(updated.status).toBe('PARTIALLY_ALLOCATED');
  });

  it('frees the allocated amount again when an allocation is revoked', async () => {
    const { txn, entry } = await makePair('100.00', '100.00');

    const created = await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '100.00',
      })
      .expect(201);

    const allocationId = (created.body as Array<{ id: string }>)[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/allocations/${allocationId}/revoke`)
      .set('Cookie', adminCookies)
      .expect(200);

    const afterRevoke = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id: txn.id },
    });
    expect(afterRevoke.status).toBe('UNRESOLVED');

    // The revoked portion must not count toward the cap any more.
    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '100.00',
      })
      .expect(201);
  });

  it('rejects allocating an inflow transaction to an outflow entry', async () => {
    const txn = await prisma.bankTransaction.create({
      data: {
        accountId,
        txnDate: new Date('2026-02-01'),
        amount: '50.00',
        type: 'INFLOW',
        description: 'inflow',
      },
    });
    const entry = await prisma.ledgerEntry.create({
      data: {
        accountId,
        categoryId,
        branchId,
        entryDate: new Date('2026-02-01'),
        amount: '50.00',
        type: 'OUTFLOW',
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '50.00',
      })
      .expect(400);
  });

  it('treats a repeated idempotencyKey as the same allocation, not a second one', async () => {
    const { txn, entry } = await makePair('100.00', '100.00');
    const body = {
      bankTransactionId: txn.id,
      ledgerEntryId: entry.id,
      amountPortion: '100.00',
      idempotencyKey: 'retry-key-1',
    };

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send(body)
      .expect(201);

    expect(await prisma.allocation.count()).toBe(1);
  });

  it('rejects a rupiah amount with more precision than the column holds', async () => {
    const { txn, entry } = await makePair('100.00', '100.00');

    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn.id,
        ledgerEntryId: entry.id,
        amountPortion: '10.001',
      })
      .expect(400);
  });
});

async function resetDatabase(prisma: PrismaService) {
  await prisma.openingStock.deleteMany({});
  await prisma.payableSettlement.deleteMany({});
  await prisma.payable.deleteMany({});
  await prisma.supplierPurchaseItem.deleteMany({});
  await prisma.supplierPurchase.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.recipeItem.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.rawMaterial.deleteMany({});
  await prisma.user.deleteMany({ where: { email: 'alloc-admin@test.local' } });
  await prisma.allocation.deleteMany({});
  await prisma.bankTransaction.deleteMany({});
  await prisma.ledgerEntry.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.supplier.deleteMany({});
}
