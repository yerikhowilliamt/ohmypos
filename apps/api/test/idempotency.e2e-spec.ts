import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { resetDatabase } from './reset-database';

/**
 * TASK-085: E2E tests for idempotency keys across money-creating endpoints.
 * Covers P0-1, P0-2, P0-4 scenarios from QA Remediation plan.
 */
describe('Idempotency Keys (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let ownerCookies: string[];
  let cashierCookies: string[];

  let branchId: string;
  let accountId: string;
  let supplierId: string;
  let rawMaterialId: string;
  let productId: string;

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

    const hash = await bcrypt.hash('Password123!', 10);

    const branch = await prisma.branch.create({
      data: { name: 'Outlet Menteng' },
    });
    branchId = branch.id;

    // Seed system refs needed for sales / purchases
    await prisma.branch.create({
      data: { name: 'Pusat (Dapur Sentral)' },
    });
    await prisma.category.create({
      data: { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' },
    });
    await prisma.category.create({
      data: { name: 'Penjualan', type: 'INFLOW' },
    });

    const account = await prisma.account.create({
      data: { name: 'Kas Kasir', type: 'CASH' },
    });
    accountId = account.id;

    const supplier = await prisma.supplier.create({
      data: { name: 'Pemasok Kopi Jaya' },
    });
    supplierId = supplier.id;

    const material = await prisma.rawMaterial.create({
      data: {
        name: 'Biji Kopi Arabika',
        unit: 'kg',
        purchaseUnit: 'kg',
        currentStock: '100.0000',
        unitCost: '1000.00',
      },
    });
    rawMaterialId = material.id;

    const product = await prisma.product.create({
      data: {
        name: 'Kopi Susu Gula Aren',
        sellPrice: '20000.00',
        recipeItems: {
          create: [
            {
              rawMaterialId: material.id,
              quantityUsed: '0.0200',
            },
          ],
        },
      },
    });
    productId = product.id;

    await prisma.user.create({
      data: {
        name: 'Test Owner',
        email: 'owner-idemp@test.local',
        passwordHash: hash,
        role: 'OWNER',
        tokenValidFrom: new Date(),
      },
    });

    await prisma.user.create({
      data: {
        name: 'Test Kasir',
        email: 'kasir-idemp@test.local',
        passwordHash: hash,
        role: 'KASIR',
        branchId: branch.id,
        tokenValidFrom: new Date(),
      },
    });

    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner-idemp@test.local', password: 'Password123!' })
      .expect(200);
    ownerCookies = ownerRes.get('Set-Cookie') ?? [];

    const kasirRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'kasir-idemp@test.local', password: 'Password123!' })
      .expect(200);
    cashierCookies = kasirRes.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  describe('P0-1: Double settlement on payable (DEF-A2)', () => {
    it('concurrent duplicate settlements yield exactly one settlement and one ledger entry', async () => {
      // 1. Create UNPAID purchase -> creates Payable
      const purchaseRes = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', ownerCookies)
        .send({
          supplierId,
          branchId,
          purchaseDate: new Date().toISOString(),
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId,
              purchaseQuantity: '100.0000',
              lineTotal: '100000.00',
            },
          ],
        })
        .expect(201);

      const purchaseBody = purchaseRes.body as {
        id: string;
        payableId: string;
        paymentStatus: string;
      };
      const payableId = purchaseBody.payableId;
      expect(purchaseBody.paymentStatus).toBe('UNPAID');

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440001';
      const settlementPayload = {
        accountId,
        amount: '50000.00',
        settledAt: new Date().toISOString(),
        idempotencyKey,
      };

      // 2. Fire 2 identical settlement requests concurrently
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/payables/${payableId}/settlements`)
          .set('Cookie', ownerCookies)
          .send(settlementPayload),
        request(app.getHttpServer())
          .post(`/api/v1/payables/${payableId}/settlements`)
          .set('Cookie', ownerCookies)
          .send(settlementPayload),
      ]);

      const body1 = res1.body as { remainingBalance: string; status: string };
      const body2 = res2.body as { remainingBalance: string; status: string };

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(body1.remainingBalance).toBe('50000.00');
      expect(body2.remainingBalance).toBe('50000.00');
      expect(body1.status).toBe('PARTIALLY_SETTLED');
      expect(body2.status).toBe('PARTIALLY_SETTLED');

      // 3. Database assertions: exactly 1 settlement and 1 ledger entry
      const settlements = await prisma.payableSettlement.findMany({
        where: { payableId },
      });
      expect(settlements).toHaveLength(1);

      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: {
          sourceType: 'PAYABLE_SETTLEMENT',
          sourceId: settlements[0].id,
        },
      });
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].amount.toString()).toBe('50000');

      const parentPurchase = await prisma.supplierPurchase.findUnique({
        where: { id: purchaseBody.id },
      });
      expect(parentPurchase?.paymentStatus).toBe('PARTIALLY_PAID');
    });
  });

  describe('P0-2: Double supplier purchase submission (DEF-A1)', () => {
    it('concurrent duplicate purchases yield exactly one purchase, one stock increment, and one ledger entry', async () => {
      const initialStock = await prisma.rawMaterial.findUnique({
        where: { id: rawMaterialId },
      });
      const initialStockVal = Number(initialStock?.currentStock);

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440002';
      const purchasePayload = {
        supplierId,
        branchId,
        purchaseDate: new Date().toISOString(),
        paymentStatus: 'PAID',
        accountId,
        idempotencyKey,
        items: [
          { rawMaterialId, purchaseQuantity: '10.0000', lineTotal: '10000.00' },
        ],
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/supplier-purchases')
          .set('Cookie', ownerCookies)
          .send(purchasePayload),
        request(app.getHttpServer())
          .post('/api/v1/supplier-purchases')
          .set('Cookie', ownerCookies)
          .send(purchasePayload),
      ]);

      const pBody1 = res1.body as { id: string };
      const pBody2 = res2.body as { id: string };

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(pBody1.id).toBe(pBody2.id);

      const purchases = await prisma.supplierPurchase.findMany({
        where: { idempotencyKey },
      });
      expect(purchases).toHaveLength(1);

      const updatedStock = await prisma.rawMaterial.findUnique({
        where: { id: rawMaterialId },
      });
      expect(Number(updatedStock?.currentStock)).toBe(initialStockVal + 10);

      const stockMovements = await prisma.stockMovement.findMany({
        where: { referenceId: purchases[0].id },
      });
      expect(stockMovements).toHaveLength(1);
      expect(stockMovements[0].direction).toBe('IN');

      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: { sourceType: 'PURCHASE', sourceId: purchases[0].id },
      });
      expect(ledgerEntries).toHaveLength(1);
    });
  });

  describe('P0-4: Double sale from slow terminal (DEF-A5)', () => {
    it('concurrent duplicate sales return the same sale ID and deduct stock only once', async () => {
      const initialStock = await prisma.rawMaterial.findUnique({
        where: { id: rawMaterialId },
      });
      const initialStockVal = Number(initialStock?.currentStock);

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440003';
      const salePayload = {
        branchId,
        accountId,
        soldAt: new Date().toISOString(),
        idempotencyKey,
        items: [{ productId, quantity: '2.0000' }], // 2 * 0.02 = 0.04kg
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/sales')
          .set('Cookie', cashierCookies)
          .send(salePayload),
        request(app.getHttpServer())
          .post('/api/v1/sales')
          .set('Cookie', cashierCookies)
          .send(salePayload),
      ]);

      const sBody1 = res1.body as { id: string };
      const sBody2 = res2.body as { id: string };

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(sBody1.id).toBe(sBody2.id);

      const sales = await prisma.sale.findMany({
        where: { idempotencyKey },
      });
      expect(sales).toHaveLength(1);

      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: { sourceType: 'SALE', sourceId: sales[0].id },
      });
      expect(ledgerEntries).toHaveLength(1);

      const updatedStock = await prisma.rawMaterial.findUnique({
        where: { id: rawMaterialId },
      });
      expect(Number(updatedStock?.currentStock)).toBeCloseTo(
        initialStockVal - 0.04,
        4,
      );
    });
  });
});
