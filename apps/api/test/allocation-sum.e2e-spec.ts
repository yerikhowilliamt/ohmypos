import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantScopedPrisma } from './tenant-fixture';
import { resetDatabase } from './reset-database';

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

    prisma = await tenantScopedPrisma(app);
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
    await prisma.saleItem.deleteMany({});
    await prisma.sale.deleteMany({});
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
    expect(body.message).toMatch(/melebihi nilai mutasi bank/i);
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

  it('rejects an allocation that would exceed ledger entry amount (DEF-A3 / TASK-083)', async () => {
    // 1 LedgerEntry OUTFLOW 100.00, 2 BankTransactions OUTFLOW each 100.00
    const entry = await prisma.ledgerEntry.create({
      data: {
        accountId,
        categoryId,
        branchId,
        entryDate: new Date('2026-02-01'),
        amount: '100.00',
        type: 'OUTFLOW',
      },
    });

    const txn1 = await prisma.bankTransaction.create({
      data: {
        accountId,
        txnDate: new Date('2026-02-01'),
        amount: '100.00',
        type: 'OUTFLOW',
        description: 'Withdrawal 1',
        status: 'UNRESOLVED',
      },
    });

    const txn2 = await prisma.bankTransaction.create({
      data: {
        accountId,
        txnDate: new Date('2026-02-01'),
        amount: '100.00',
        type: 'OUTFLOW',
        description: 'Withdrawal 2',
        status: 'UNRESOLVED',
      },
    });

    // 1st allocation takes the full 100.00 of entry
    await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn1.id,
        ledgerEntryId: entry.id,
        amountPortion: '100.00',
      })
      .expect(201);

    // 2nd allocation to same entry must fail with 400
    const res = await request(app.getHttpServer())
      .post('/api/v1/allocations')
      .set('Cookie', adminCookies)
      .send({
        bankTransactionId: txn2.id,
        ledgerEntryId: entry.id,
        amountPortion: '100.00',
      })
      .expect(400);

    const body = res.body as { message: string };
    expect(body.message).toMatch(/melebihi nilai catatan transaksi/i);

    const activeAllocations = await prisma.allocation.findMany({
      where: { ledgerEntryId: entry.id, status: 'ACTIVE' },
    });
    expect(activeAllocations).toHaveLength(1);

    const reloadedTxn2 = await prisma.bankTransaction.findUnique({
      where: { id: txn2.id },
    });
    expect(reloadedTxn2?.status).not.toBe('MATCHED');
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

  describe('Concurrency races (DEF-QA-02, DEF-QA-03)', () => {
    it('never lets a concurrent create() and revoke() push the ACTIVE sum past the transaction amount', async () => {
      const { txn, entry } = await makePair('100.00', '100.00');

      const first = await request(app.getHttpServer())
        .post('/api/v1/allocations')
        .set('Cookie', adminCookies)
        .send({
          bankTransactionId: txn.id,
          ledgerEntryId: entry.id,
          amountPortion: '100.00',
        })
        .expect(201);
      const allocationId = (first.body as Array<{ id: string }>)[0].id;

      // 5 concurrent revoke attempts racing 5 concurrent top-up creates
      // against the same (bankTransaction, ledgerEntry) pair — DEF-QA-02's
      // fix locks bank_transactions then ledger_entries in both create() and
      // revoke(), in that order, so these can never interleave into an
      // over-allocated state no matter how they're scheduled.
      const revokeAttempts = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/allocations/${allocationId}/revoke`)
          .set('Cookie', adminCookies),
      );
      const createAttempts = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/allocations')
          .set('Cookie', adminCookies)
          .send({
            bankTransactionId: txn.id,
            ledgerEntryId: entry.id,
            amountPortion: '100.00',
          }),
      );

      const results = await Promise.all([...revokeAttempts, ...createAttempts]);
      for (const res of results) {
        expect([200, 201, 400]).toContain(res.status);
        expect(res.status).not.toBeGreaterThanOrEqual(500);
      }

      const active = await prisma.allocation.findMany({
        where: { bankTransactionId: txn.id, status: 'ACTIVE' },
      });
      const activeSum = active.reduce(
        (sum, a) => sum + Number(a.amountPortion),
        0,
      );
      expect(activeSum).toBeLessThanOrEqual(100);
    });

    it('never proposes the same UNRESOLVED bank transaction to two concurrent propose calls', async () => {
      const pairs = await Promise.all(
        Array.from({ length: 10 }, (_, i) => {
          const amount = `${150 + i}.00`;
          return Promise.all([
            prisma.bankTransaction.create({
              data: {
                accountId,
                txnDate: new Date('2026-04-01'),
                amount,
                type: 'INFLOW',
                description: `race-${i}`,
                status: 'UNRESOLVED',
              },
            }),
            prisma.ledgerEntry.create({
              data: {
                accountId,
                categoryId,
                branchId,
                entryDate: new Date('2026-04-01'),
                amount,
                type: 'INFLOW',
              },
            }),
          ]);
        }),
      );
      const allTxnIds = pairs.map(([txn]) => txn.id);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/matching/propose')
          .set('Cookie', adminCookies)
          .send({ accountId }),
        request(app.getHttpServer())
          .post('/api/v1/matching/propose')
          .set('Cookie', adminCookies)
          .send({ accountId }),
      ]);

      const idsA = new Set(
        (
          resA.body as { candidates: Array<{ bankTransactionIds: string[] }> }
        ).candidates.flatMap((c) => c.bankTransactionIds),
      );
      const idsB = new Set(
        (
          resB.body as { candidates: Array<{ bankTransactionIds: string[] }> }
        ).candidates.flatMap((c) => c.bankTransactionIds),
      );

      const overlap = [...idsA].filter((id) => idsB.has(id));
      expect(overlap).toHaveLength(0);

      // Every transaction ends up PENDING_REVIEW exactly once, or is still
      // UNRESOLVED (both calls' SELECT ... FOR UPDATE SKIP LOCKED happened to
      // race the exact same instant) — never left in a state a duplicate
      // proposal would imply.
      const reloaded = await prisma.bankTransaction.findMany({
        where: { id: { in: allTxnIds } },
      });
      for (const t of reloaded) {
        expect(['UNRESOLVED', 'PENDING_REVIEW']).toContain(t.status);
      }
    });
  });
});
