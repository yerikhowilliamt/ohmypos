import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import Decimal from 'decimal.js';

describe('Concurrency & Integrity Harness (e2e - DEF-006, P0-3, P0-4)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let branchId: string;
  let accountId: string;
  let supplierId: string;
  let ownerCookies: string[];
  let kasirCookies: string[];

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
        email: { in: ['concur-owner@test.local', 'concur-kasir@test.local'] },
      },
    });
    await prisma.account.deleteMany({
      where: { name: 'Concurrency Bank' },
    });
    await prisma.supplier.deleteMany({
      where: { name: 'Concurrency Supplier' },
    });
    await prisma.branch.deleteMany({
      where: { name: 'Concurrency Test Branch' },
    });
  }

  describe('P0-4: Oversubscribed Concurrent Sales (ADR-007)', () => {
    it('serializes 20 concurrent sales with stock for only 8 units: exactly 8 succeed, 12 fail 409, zero negative stock', async () => {
      // 1. Create Raw Material with stock for exactly 8 units (8 * 0.2500 = 2.0000 kg)
      const material = await prisma.rawMaterial.create({
        data: {
          name: 'Concur Gula',
          unit: 'kg',
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
              unitCost: '50000.00',
              quantity: '8.0000',
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
  });
});
