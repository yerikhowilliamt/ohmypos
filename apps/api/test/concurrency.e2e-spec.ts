import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import Decimal from 'decimal.js';

/**
 * Phase 14 finding (B2 investigation): `Promise.all` on 50+ concurrent
 * supertest requests short-circuits on the FIRST rejected promise — one slow
 * response under real lock-queue depth reads as a socket-level failure
 * (ECONNRESET) to the client even though the server keeps processing it. The
 * other in-flight requests are then abandoned mid-test rather than awaited,
 * so their writes land AFTER the test's own cleanup already ran, orphaning
 * rows a later deleteMany() can't remove — the actual cause of the FK
 * violations seen chasing this. `Promise.allSettled` waits for every request
 * to actually finish (success or network failure) before assertions run, and
 * a network-level rejection is itself asserted to be zero, same as the "zero
 * 5xx" checks — it is the same category of failure (plan §5.2).
 */
async function settleAllChunked<T>(
  factories: Array<() => Promise<T>>,
  chunkSize: number,
): Promise<{ resolved: T[]; rejectedCount: number }> {
  const resolved: T[] = [];
  let rejectedCount = 0;
  for (let i = 0; i < factories.length; i += chunkSize) {
    const chunk = factories.slice(i, i + chunkSize).map((factory) => factory());
    const settled = await Promise.allSettled(chunk);
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        resolved.push(outcome.value);
      } else {
        rejectedCount += 1;
      }
    }
  }
  return { resolved, rejectedCount };
}

describe('Concurrency & Integrity Harness (e2e - DEF-006, P0-3, P0-4)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let branchId: string;
  let branchBId: string;
  let accountId: string;
  let supplierId: string;
  let ownerCookies: string[];
  let kasirCookies: string[];
  let kasirBCookies: string[];

  const password = 'TestPass123!';

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
    await cleanup();

    const branch = await prisma.branch.create({
      data: { name: 'Concurrency Test Branch' },
    });
    branchId = branch.id;

    // Workstream B (Phase 14 plan §5.3, B2) needs a genuine second branch
    // sharing the same centralized stock pool (ADR-007) — the scenario ADR-007
    // is actually about, which the pre-existing single-branch tests never hit.
    const branchB = await prisma.branch.create({
      data: { name: 'Concurrency Test Branch B' },
    });
    branchBId = branchB.id;

    await prisma.branch.upsert({
      where: { name: 'Pusat (Dapur Sentral)' },
      update: {},
      create: { name: 'Pusat (Dapur Sentral)', address: 'Dapur Sentral' },
    });

    await prisma.category.upsert({
      where: { name: 'Penjualan' },
      update: {},
      create: { name: 'Penjualan', type: 'INFLOW' },
    });

    await prisma.category.upsert({
      where: { name: 'Pembelian Bahan Baku' },
      update: {},
      create: { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' },
    });

    const account = await prisma.account.create({
      data: { name: 'Concurrency Bank', type: 'BANK', openingBalance: '0' },
    });
    accountId = account.id;

    const supplier = await prisma.supplier.create({
      data: { name: 'Concurrency Supplier' },
    });
    supplierId = supplier.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        {
          name: 'Owner',
          email: 'concur-owner@test.local',
          passwordHash,
          role: 'OWNER',
        },
        {
          name: 'Kasir',
          email: 'concur-kasir@test.local',
          passwordHash,
          role: 'KASIR',
          branchId,
        },
        {
          name: 'Kasir B',
          email: 'concur-kasir-b@test.local',
          passwordHash,
          role: 'KASIR',
          branchId: branchBId,
        },
      ],
    });

    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'concur-owner@test.local', password })
      .expect(200);
    ownerCookies = ownerRes.get('Set-Cookie') ?? [];

    const kasirRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'concur-kasir@test.local', password })
      .expect(200);
    kasirCookies = kasirRes.get('Set-Cookie') ?? [];

    const kasirBRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'concur-kasir-b@test.local', password })
      .expect(200);
    kasirBCookies = kasirBRes.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.allocation.deleteMany({});
    await prisma.bankTransaction.deleteMany({});
    await prisma.payableSettlement.deleteMany({});
    await prisma.payable.deleteMany({});
    await prisma.saleItem.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.supplierPurchaseItem.deleteMany({});
    await prisma.supplierPurchase.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
    await prisma.openingStock.deleteMany({});
    await prisma.recipeItem.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.rawMaterial.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'concur-owner@test.local',
            'concur-kasir@test.local',
            'concur-kasir-b@test.local',
          ],
        },
      },
    });
    await prisma.account.deleteMany({
      where: { name: 'Concurrency Bank' },
    });
    await prisma.supplier.deleteMany({
      where: { name: 'Concurrency Supplier' },
    });
    await prisma.branch.deleteMany({
      where: {
        name: { in: ['Concurrency Test Branch', 'Concurrency Test Branch B'] },
      },
    });
  }

  describe('P0-4: Oversubscribed Concurrent Sales (ADR-007)', () => {
    it('serializes 20 concurrent sales with stock for only 8 units: exactly 8 succeed, 12 fail 409, zero negative stock', async () => {
      // 1. Create Raw Material with stock for exactly 8 units (8 * 0.2500 = 2.0000 kg)
      const material = await prisma.rawMaterial.create({
        data: {
          name: 'Concur Gula',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '10000.00',
          currentStock: '2.0000',
        },
      });

      // 2. Create Product with recipe requiring 0.2500 kg Gula
      const product = await prisma.product.create({
        data: {
          name: 'Concur Teh Manis',
          sellPrice: '15000.00',
          recipeItems: {
            create: [
              {
                rawMaterialId: material.id,
                quantityUsed: '0.2500',
              },
            ],
          },
        },
      });

      // 3. Fire 20 simultaneous sales of 1 unit each
      const requests = Array.from({ length: 20 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/sales')
          .set('Cookie', kasirCookies)
          .send({
            branchId,
            accountId,
            soldAt: new Date(Date.now() - 1000 * (i + 1)).toISOString(),
            items: [{ productId: product.id, quantity: '1.0000' }],
          }),
      );

      const results = await Promise.all(requests);

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successes).toHaveLength(8);
      expect(conflicts).toHaveLength(12);

      // 4. Verify Raw Material stock in DB is exactly 0.0000 and never negative
      const updatedMaterial = await prisma.rawMaterial.findUnique({
        where: { id: material.id },
      });
      expect(
        new Decimal(updatedMaterial?.currentStock.toString() ?? '0').toNumber(),
      ).toBe(0);

      // 5. Verify movements count equals successful sales count (no orphans from rollbacks)
      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: material.id },
      });
      expect(movements).toHaveLength(8);

      const sales = await prisma.sale.findMany({
        where: { branchId },
      });
      expect(sales).toHaveLength(8);

      // 6. Verify ledger entries match total sale income
      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: { sourceType: 'SALE' },
      });
      expect(ledgerEntries).toHaveLength(8);
      const totalIncome = ledgerEntries.reduce(
        (sum, entry) => sum.plus(entry.amount.toString()),
        new Decimal(0),
      );
      expect(totalIncome.toNumber()).toBe(8 * 15000);
    });
  });

  describe('P0-4: Concurrent Payables Double Settlement (ADR-006, ADR-016)', () => {
    it('serializes 8 concurrent full settlements: exactly 1 succeeds, 7 return 409, balance reaches 0', async () => {
      // 1. Create a raw material
      const kopiMaterial = await prisma.rawMaterial.create({
        data: {
          name: 'Concur Kopi',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '50000.00',
          currentStock: '0.0000',
        },
      });

      // 2. Create a supplier purchase with UNPAID status creating a Rp 400,000 payable
      const purchaseRes = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', ownerCookies)
        .send({
          supplierId,
          branchId: null,
          purchaseDate: '2026-08-10T00:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: kopiMaterial.id,
              purchaseQuantity: '8.0000',
              lineTotal: '400000.00',
            },
          ],
        })
        .expect(201);

      const purchaseBody = purchaseRes.body as { id: string };
      const purchaseId = purchaseBody.id;
      const purchase = await prisma.supplierPurchase.findUnique({
        where: { id: purchaseId },
        include: { payable: true },
      });
      const payableId = purchase?.payable?.id as string;
      expect(payableId).toBeDefined();

      // 2. Fire 8 concurrent full settlements of Rp 400,000 each
      const settlementRequests = Array.from({ length: 8 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/payables/${payableId}/settlements`)
          .set('Cookie', ownerCookies)
          .send({
            accountId,
            amount: '400000.00',
            settledAt: new Date().toISOString(),
          }),
      );

      const settlementResults = await Promise.all(settlementRequests);

      const settledSuccesses = settlementResults.filter(
        (r) => r.status === 201,
      );
      const settledConflicts = settlementResults.filter(
        (r) => r.status === 409,
      );

      expect(settledSuccesses).toHaveLength(1);
      expect(settledConflicts).toHaveLength(7);

      // 3. Verify payable balance in DB
      const updatedPayable = await prisma.payable.findUnique({
        where: { id: payableId },
        include: { settlements: true },
      });
      expect(
        new Decimal(
          updatedPayable?.remainingBalance.toString() ?? '1',
        ).toNumber(),
      ).toBe(0);
      expect(updatedPayable?.status).toBe('SETTLED');
      expect(updatedPayable?.settlements).toHaveLength(1);
    });
  });

  describe('P0-3: Bank Import Fidelity & Same-Day Deduplication (DEF-003, DEF-004, DEF-005)', () => {
    it('imports same-day distinct rows, skips garbage & negative amounts, and cleanly deduplicates on re-import', async () => {
      const csvContent = [
        '01/08/2026,SETORAN TUNAI 1,0000,500000.00,CR',
        '01/08/2026,SETORAN TUNAI 1,0000,500000.00,CR', // identical row in same statement
        '01/08/2026,TARIK TUNAI,0000,200000.00,DB',
        '02/08/2026,INVALID TYPE,0000,100000.00,CREDIT', // invalid code -> skipped
        '02/08/2026,NEGATIVE AMOUNT,0000,-900000.00,CR', // negative -> skipped
      ].join('\n');

      // 1. First import
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/import/csv/${accountId}?format=BCA`)
        .set('Cookie', ownerCookies)
        .attach('file', Buffer.from(csvContent), 'bca-statement.csv')
        .expect(200);

      expect(res1.body).toMatchObject({
        imported: 3,
        skipped: 0,
        total: 3,
      });

      // 2. Re-import identical file
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/import/csv/${accountId}?format=BCA`)
        .set('Cookie', ownerCookies)
        .attach('file', Buffer.from(csvContent), 'bca-statement.csv')
        .expect(200);

      expect(res2.body).toMatchObject({
        imported: 0,
        skipped: 3,
        total: 3,
      });

      // 3. Verify actual bank balance summary: IN 1,000,000 - OUT 200,000 = +800,000
      const summaryRes = await request(app.getHttpServer())
        .get(`/api/v1/reconciliation/summary?accountId=${accountId}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const summaryBody = summaryRes.body as { actualBankBalance: string };
      expect(summaryBody.actualBankBalance).toBe('800000.00');
    });

    it('rejects a CSV sent to the PDF route, so it never reaches a PDF parser', async () => {
      // Named and typed as a PDF, so only the file signature can catch it.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/import/pdf/${accountId}?format=MANDIRI_PDF`)
        .set('Cookie', ownerCookies)
        .attach('file', Buffer.from('01/08/2026,X,0000,1.00,CR'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(/PDF/i);
    });

    it('rejects a PDF sent to the CSV route rather than importing zero rows', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/import/csv/${accountId}?format=BCA`)
        .set('Cookie', ownerCookies)
        .attach('file', Buffer.from('%PDF-1.5\nrest of a pdf'), 'x.csv')
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(/PDF/i);
    });
  });

  // Phase 14 plan §5.3 — B1-B5. Extends this suite in place (not a separate
  // file) so these cases run in the normal test:e2e gate and share the
  // fixtures/cleanup above, per the plan's Workstream B design decision.

  describe('B1: lock-ordering / deadlock probe (ADR-016)', () => {
    it('40 concurrent sales, recipes declared in opposite material order, never deadlock', async () => {
      const lockA = await prisma.rawMaterial.create({
        data: {
          name: 'Lock A',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '1000.00',
          currentStock: '1000.0000',
        },
      });
      const lockB = await prisma.rawMaterial.create({
        data: {
          name: 'Lock B',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '1000.00',
          currentStock: '1000.0000',
        },
      });

      // Recipe items declared in OPPOSITE order between the two products.
      // ADR-016 requires the service to sort locks ascending by
      // rawMaterialId regardless of this declaration order — if that sort
      // were ever dropped, concurrent sales of these two products would lock
      // A-then-B in one transaction and B-then-A in another, the classic
      // shape of a Postgres 40P01 deadlock.
      const cartXY = await prisma.product.create({
        data: {
          name: 'Cart XY',
          sellPrice: '5000.00',
          recipeItems: {
            create: [
              { rawMaterialId: lockA.id, quantityUsed: '0.0010' },
              { rawMaterialId: lockB.id, quantityUsed: '0.0010' },
            ],
          },
        },
      });
      const cartYX = await prisma.product.create({
        data: {
          name: 'Cart YX',
          sellPrice: '5000.00',
          recipeItems: {
            create: [
              { rawMaterialId: lockB.id, quantityUsed: '0.0010' },
              { rawMaterialId: lockA.id, quantityUsed: '0.0010' },
            ],
          },
        },
      });

      // Interleaved (i % 2), not split by index range: chunking (below) fires
      // in windows of 20, and a range split would put a whole branch's
      // requests in one window, silently defeating "both cashiers" per window.
      const requestFactories = Array.from({ length: 40 }, (_, i) => {
        const productId = i % 2 === 0 ? cartXY.id : cartYX.id;
        const cookies = i % 2 === 0 ? kasirCookies : kasirBCookies;
        const requestBranchId = i % 2 === 0 ? branchId : branchBId;
        return () =>
          request(app.getHttpServer())
            .post('/api/v1/sales')
            .set('Cookie', cookies)
            .send({
              branchId: requestBranchId,
              accountId,
              soldAt: new Date(Date.now() - 1000 * (i + 1)).toISOString(),
              items: [{ productId, quantity: '1.0000' }],
            });
      });

      const { resolved: results, rejectedCount } = await settleAllChunked(
        requestFactories,
        10,
      );

      expect(rejectedCount).toBe(0);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(results.filter((r) => r.status === 201)).toHaveLength(40);

      const updatedA = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: lockA.id },
      });
      const updatedB = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: lockB.id },
      });
      // 1000.0000 - 40 * 0.0010 = 999.9600 for BOTH — every one of the 40
      // sales consumes both materials regardless of which cart triggered it.
      expect(updatedA.currentStock.toFixed(4)).toBe('999.9600');
      expect(updatedB.currentStock.toFixed(4)).toBe('999.9600');

      const movementsA = await prisma.stockMovement.count({
        where: { rawMaterialId: lockA.id },
      });
      const movementsB = await prisma.stockMovement.count({
        where: { rawMaterialId: lockB.id },
      });
      expect(movementsA).toBe(40);
      expect(movementsB).toBe(40);
    });
  });

  describe('B2: 50-way oversubscription across two branches sharing one stock pool (ADR-007)', () => {
    it('exactly 18 succeed, 32 fail 409, zero 5xx, and successes span both branches', async () => {
      const material = await prisma.rawMaterial.create({
        data: {
          name: 'Oversub Gula',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '10000.00',
          currentStock: '18.0000',
        },
      });
      const product = await prisma.product.create({
        data: {
          name: 'Oversub Teh Manis',
          sellPrice: '12000.00',
          recipeItems: {
            create: [{ rawMaterialId: material.id, quantityUsed: '1.0000' }],
          },
        },
      });

      // B5 (plan §5.3): per-request timing, feeding DEBT-002/DEBT-008(lock
      // batching) — neither of those debt entries has a measured number today.
      // Interleaved (i % 2), not split by index range — chunking (below) fires
      // in windows of 20, and a range split would put a whole branch's 25
      // requests in one window, letting it exhaust the shared stock before the
      // other branch's window even starts (masking ADR-007's actual scenario).
      const timings: number[] = [];
      const requestFactories = Array.from({ length: 50 }, (_, i) => {
        const cookies = i % 2 === 0 ? kasirCookies : kasirBCookies;
        const requestBranchId = i % 2 === 0 ? branchId : branchBId;
        return () => {
          const startedAt = Date.now();
          return request(app.getHttpServer())
            .post('/api/v1/sales')
            .set('Cookie', cookies)
            .send({
              branchId: requestBranchId,
              accountId,
              soldAt: new Date(Date.now() - 1000 * (i + 1)).toISOString(),
              items: [{ productId: product.id, quantity: '1.0000' }],
            })
            .then((res) => {
              timings.push(Date.now() - startedAt);
              return res;
            });
        };
      });

      const { resolved: results, rejectedCount } = await settleAllChunked(
        requestFactories,
        10,
      );

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(rejectedCount).toBe(0);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(successes).toHaveLength(18);
      expect(conflicts).toHaveLength(32);

      timings.sort((a, b) => a - b);
      const percentile = (p: number) =>
        timings[
          Math.min(timings.length - 1, Math.floor(p * (timings.length - 1)))
        ];

      console.log(
        `[CONCURRENCY B2] n=${timings.length} p50=${percentile(0.5)}ms p95=${percentile(0.95)}ms max=${timings[timings.length - 1]}ms successes=${successes.length} conflicts=${conflicts.length}`,
      );

      const updatedMaterial = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: material.id },
      });
      expect(updatedMaterial.currentStock.toFixed(4)).toBe('0.0000');

      const movements = await prisma.stockMovement.count({
        where: { rawMaterialId: material.id },
      });
      expect(movements).toBe(18);

      const sales = await prisma.sale.findMany({
        where: { items: { some: { productId: product.id } } },
        select: { branchId: true },
      });
      expect(sales).toHaveLength(18);
      const salesBranchIds = new Set(sales.map((s) => s.branchId));
      expect(salesBranchIds.has(branchId)).toBe(true);
      expect(salesBranchIds.has(branchBId)).toBe(true);
    });
  });

  describe('B3: mixed-direction race — sale OUT vs purchase IN on one material', () => {
    it('all 5 purchases succeed; the ledger and balance reconcile for whatever sales succeeded', async () => {
      const material = await prisma.rawMaterial.create({
        data: {
          name: 'Mixed Race Material',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '5000.00',
          currentStock: '1.0000',
        },
      });
      const product = await prisma.product.create({
        data: {
          name: 'Mixed Race Product',
          sellPrice: '3000.00',
          recipeItems: {
            create: [{ rawMaterialId: material.id, quantityUsed: '0.2000' }],
          },
        },
      });

      const saleRequestFactories = Array.from(
        { length: 10 },
        (_, i) => () =>
          request(app.getHttpServer())
            .post('/api/v1/sales')
            .set('Cookie', kasirCookies)
            .send({
              branchId,
              accountId,
              soldAt: new Date(Date.now() - 1000 * (i + 1)).toISOString(),
              items: [{ productId: product.id, quantity: '1.0000' }],
            }),
      );
      const purchaseRequestFactories = Array.from(
        { length: 5 },
        (_, i) => () =>
          request(app.getHttpServer())
            .post('/api/v1/supplier-purchases')
            .set('Cookie', ownerCookies)
            .send({
              supplierId,
              branchId: null,
              purchaseDate: new Date(Date.now() - 1000 * (i + 1)).toISOString(),
              paymentStatus: 'PAID',
              accountId,
              items: [
                {
                  rawMaterialId: material.id,
                  purchaseQuantity: '1.0000',
                  lineTotal: '5000.00',
                },
              ],
            }),
      );

      const [
        { resolved: saleResults, rejectedCount: saleRejectedCount },
        { resolved: purchaseResults, rejectedCount: purchaseRejectedCount },
      ] = await Promise.all([
        settleAllChunked(saleRequestFactories, 10),
        settleAllChunked(purchaseRequestFactories, 5),
      ]);

      expect(saleRejectedCount).toBe(0);
      expect(purchaseRejectedCount).toBe(0);
      expect(saleResults.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(purchaseResults.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(purchaseResults.filter((r) => r.status === 201)).toHaveLength(5);

      // Deliberately non-deterministic: whatever interleaving occurs, the
      // ledger and balance must still reconcile exactly (plan §5.3 B3).
      const n = saleResults.filter((r) => r.status === 201).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);

      const updated = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: material.id },
      });
      const expectedStock = new Decimal('1.0000')
        .plus('5.0000')
        .minus(new Decimal(n).times('0.2000'));
      expect(updated.currentStock.toFixed(4)).toBe(expectedStock.toFixed(4));
      expect(new Decimal(updated.currentStock.toString()).isNegative()).toBe(
        false,
      );

      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: material.id },
      });
      const movementSum = movements.reduce(
        (sum, m) =>
          m.direction === 'IN'
            ? sum.plus(m.quantity.toString())
            : sum.minus(m.quantity.toString()),
        new Decimal(0),
      );
      // The material was seeded with currentStock: '1.0000' directly (no
      // StockMovement row for it) — movementSum is the NET of everything that
      // happened during the race, so it must reconcile against currentStock
      // minus that starting balance, not against currentStock itself.
      const netChange = new Decimal(updated.currentStock.toString()).minus(
        '1.0000',
      );
      expect(movementSum.toFixed(4)).toBe(netChange.toFixed(4));
    });
  });

  describe('B4: 30-way concurrent partial settlements against one payable (DEBT-007)', () => {
    it('exactly 15 succeed, 15 fail 409, remainingBalance reaches exactly 0.00, zero 5xx', async () => {
      const material = await prisma.rawMaterial.create({
        data: {
          name: 'B4 Material',
          unit: 'kg',
          purchaseUnit: 'kg',
          unitCost: '10000.00',
          currentStock: '0.0000',
        },
      });
      const purchaseRes = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', ownerCookies)
        .send({
          supplierId,
          branchId: null,
          purchaseDate: '2026-08-10T00:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: material.id,
              purchaseQuantity: '30.0000',
              lineTotal: '300000.00',
            },
          ],
        })
        .expect(201);

      const purchase = await prisma.supplierPurchase.findUniqueOrThrow({
        where: { id: (purchaseRes.body as { id: string }).id },
        include: { payable: true },
      });
      const payableId = purchase.payable!.id;

      const settlementRequestFactories = Array.from(
        { length: 30 },
        () => () =>
          request(app.getHttpServer())
            .post(`/api/v1/payables/${payableId}/settlements`)
            .set('Cookie', ownerCookies)
            .send({
              accountId,
              amount: '20000.00',
              settledAt: new Date().toISOString(),
            }),
      );
      const { resolved: results, rejectedCount } = await settleAllChunked(
        settlementRequestFactories,
        5,
      );

      expect(rejectedCount).toBe(0);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(results.filter((r) => r.status === 201)).toHaveLength(15);
      expect(results.filter((r) => r.status === 409)).toHaveLength(15);

      const updatedPayable = await prisma.payable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(updatedPayable.remainingBalance.toFixed(2)).toBe('0.00');
      expect(updatedPayable.status).toBe('SETTLED');

      const settlementRows = await prisma.payableSettlement.findMany({
        where: { payableId },
      });
      expect(settlementRows).toHaveLength(15);

      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: { id: { in: settlementRows.map((s) => s.ledgerEntryId) } },
      });
      expect(ledgerEntries).toHaveLength(15);
      expect(
        ledgerEntries.every((e) => e.sourceType === 'PAYABLE_SETTLEMENT'),
      ).toBe(true);
      const sum = ledgerEntries.reduce(
        (total, e) => total.plus(e.amount.toString()),
        new Decimal(0),
      );
      expect(sum.toFixed(2)).toBe('300000.00');
    });
  });
});
