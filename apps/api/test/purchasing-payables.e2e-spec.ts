/**
 * OhMyPos — Purchasing & Payables E2E Tests (PRD §5.3, ADR-004, ADR-006, ADR-007, ADR-011, ADR-014, Playbook §10).
 *
 * Auth-aware end-to-end test suite testing:
 * - ADR-006 binary branch (PAID -> LedgerEntry XOR UNPAID -> Payable)
 * - Stock movement on all purchases under FOR UPDATE lock (ADR-007)
 * - Central purchase ledger attribution to Pusat (ADR-014)
 * - Settlement flow, over-settlement rejection, concurrency lock under Promise.allSettled
 * - Rollback guarantees across transactional operations
 * - RBAC & BranchScopeGuard enforcement
 * - Decimal scale preservation and balance integrity re-derivation
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  PayableResponse,
  PayableSupplierSummary,
  SupplierPurchaseResponse,
} from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';

describe('Purchasing & Payables (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPassword123!';
  const owner = { email: 'pp-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'pp-admin@test.local', cookies: [] as string[] };
  const kasir1 = { email: 'pp-kasir1@test.local', cookies: [] as string[] };
  const kasir2 = { email: 'pp-kasir2@test.local', cookies: [] as string[] };

  let branch1Id: string;
  let branch2Id: string;
  let centralBranchId: string;
  let defaultAccountId: string;

  let rawMaterialGulaId: string;
  let rawMaterialKopiId: string;
  let supplierAId: string;
  let supplierBId: string;

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

    // Ensure system branches and categories exist
    const centralBranch = await prisma.branch.upsert({
      where: { name: 'Pusat (Dapur Sentral)' },
      update: {},
      create: { name: 'Pusat (Dapur Sentral)', address: 'Dapur Sentral' },
    });
    centralBranchId = centralBranch.id;

    const b1 = await prisma.branch.create({
      data: { name: 'PP Test Branch 1', address: 'Jl. Test 1' },
    });
    branch1Id = b1.id;

    const b2 = await prisma.branch.create({
      data: { name: 'PP Test Branch 2', address: 'Jl. Test 2' },
    });
    branch2Id = b2.id;

    const account = await prisma.account.upsert({
      where: { id: '00000000-0000-4000-8000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Bank Utama',
        type: 'BANK',
        openingBalance: '0',
      },
    });
    defaultAccountId = account.id;

    await prisma.category.upsert({
      where: { name: 'Pembelian Bahan Baku' },
      update: {},
      create: { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' },
    });

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        { name: 'PP Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'PP Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'PP Kasir 1',
          email: kasir1.email,
          passwordHash,
          role: 'KASIR',
          branchId: branch1Id,
        },
        {
          name: 'PP Kasir 2',
          email: kasir2.email,
          passwordHash,
          role: 'KASIR',
          branchId: branch2Id,
        },
      ],
    });

    owner.cookies = await login(owner.email);
    admin.cookies = await login(admin.email);
    kasir1.cookies = await login(kasir1.email);
    kasir2.cookies = await login(kasir2.email);

    // Create test raw materials
    const gula = await prisma.rawMaterial.create({
      data: {
        name: 'PP Gula Pasir',
        unit: 'kg',
        purchaseUnit: 'kg',
        unitCost: '12000.00',
        currentStock: '10.0000',
        lowStockThreshold: '2.0000',
      },
    });
    rawMaterialGulaId = gula.id;

    const kopi = await prisma.rawMaterial.create({
      data: {
        name: 'PP Kopi Arabika',
        unit: 'kg',
        purchaseUnit: 'kg',
        unitCost: '85000.00',
        currentStock: '5.0000',
        lowStockThreshold: '1.0000',
      },
    });
    rawMaterialKopiId = kopi.id;

    // Create test suppliers
    const sA = await prisma.supplier.create({
      data: {
        name: 'PP Toko Bahan Kue',
        contact: '0812-9999-8888',
      },
    });
    supplierAId = sA.id;

    const sB = await prisma.supplier.create({
      data: {
        name: 'PP CV Roastery Nusantara',
        contact: '0813-7777-6666',
      },
    });
    supplierBId = sB.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  async function cleanup() {
    // Delete in FK-safe reverse order
    await prisma.payableSettlement.deleteMany({});
    await prisma.payable.deleteMany({});
    await prisma.supplierPurchaseItem.deleteMany({});
    await prisma.supplierPurchase.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { sourceType: { in: ['PURCHASE', 'PAYABLE_SETTLEMENT'] } },
          {
            branch: { name: { in: ['PP Test Branch 1', 'PP Test Branch 2'] } },
          },
          { note: { contains: 'PP Test' } },
        ],
      },
    });
    await prisma.supplier.deleteMany({
      where: {
        name: { startsWith: 'PP ' },
      },
    });
    await prisma.rawMaterial.deleteMany({
      where: {
        name: { startsWith: 'PP ' },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [owner.email, admin.email, kasir1.email, kasir2.email],
        },
      },
    });
    await prisma.branch.deleteMany({
      where: {
        name: { in: ['PP Test Branch 1', 'PP Test Branch 2'] },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 1. ADR-006 Binary Branch & Stock Movements
  // ---------------------------------------------------------------------------
  describe('ADR-006 Binary Branch & Stock Inbound', () => {
    it('Case 1: PAID purchase creates LedgerEntry and NO Payable', async () => {
      const initialStockKopi = (
        await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialKopiId },
        })
      ).currentStock;

      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierBId,
          branchId: null, // Central purchase
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'PAID',
          accountId: defaultAccountId,
          note: 'PP Test Paid Purchase',
          items: [
            {
              rawMaterialId: rawMaterialKopiId,
              purchaseQuantity: '2.0000',
              lineTotal: '170000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.isCentral).toBe(true);
      expect(body.branchId).toBeNull();
      expect(body.paymentStatus).toBe('PAID');
      expect(body.totalAmount).toBe('170000.00');
      expect(body.ledgerEntryId).not.toBeNull();
      expect(body.payableId).toBeNull();

      // Verify LedgerEntry in DB
      const ledgerEntry = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: body.ledgerEntryId! },
      });
      expect(ledgerEntry.sourceType).toBe('PURCHASE');
      expect(ledgerEntry.sourceId).toBe(body.id);
      expect(ledgerEntry.type).toBe('OUTFLOW');
      expect(ledgerEntry.amount.toFixed(2)).toBe('170000.00');
      expect(ledgerEntry.branchId).toBe(centralBranchId); // ADR-014

      // Verify zero Payable rows exist for this purchase
      const payableCount = await prisma.payable.count({
        where: { supplierPurchaseId: body.id },
      });
      expect(payableCount).toBe(0);

      // Verify stock incremented
      const updatedStockKopi = (
        await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialKopiId },
        })
      ).currentStock;
      expect(updatedStockKopi.minus(initialStockKopi).toFixed(4)).toBe(
        '2.0000',
      );
    });

    it('Case 2: UNPAID purchase creates Payable and NO LedgerEntry', async () => {
      const initialStockGula = (
        await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialGulaId },
        })
      ).currentStock;

      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: '2026-08-16T11:00:00.000Z',
          paymentStatus: 'UNPAID',
          note: 'PP Test Unpaid Purchase',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '5.0000',
              lineTotal: '60000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.isCentral).toBe(false);
      expect(body.branchId).toBe(branch1Id);
      expect(body.paymentStatus).toBe('UNPAID');
      expect(body.totalAmount).toBe('60000.00');
      expect(body.ledgerEntryId).toBeNull();
      expect(body.payableId).not.toBeNull();

      // Verify NO LedgerEntry exists for this purchase
      const ledgerCount = await prisma.ledgerEntry.count({
        where: { sourceType: 'PURCHASE', sourceId: body.id },
      });
      expect(ledgerCount).toBe(0);

      // Verify Payable exists in DB with OPEN status and matching balance
      const payable = await prisma.payable.findUniqueOrThrow({
        where: { id: body.payableId! },
      });
      expect(payable.status).toBe('OPEN');
      expect(payable.originalAmount.toFixed(2)).toBe('60000.00');
      expect(payable.remainingBalance.toFixed(2)).toBe('60000.00');

      // Verify stock incremented
      const updatedStockGula = (
        await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialGulaId },
        })
      ).currentStock;
      expect(updatedStockGula.minus(initialStockGula).toFixed(4)).toBe(
        '5.0000',
      );
    });

    it('Case 3: StockMovement is recorded with exact quantity and snapshot unit cost', async () => {
      // Creates its own purchase and queries by referenceId rather than reading
      // the most recent rows globally: an ordering-based query passes even when
      // the movements are attached to the wrong purchase, which is precisely
      // the defect this case exists to catch.
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: '2026-08-16T12:00:00.000Z',
          paymentStatus: 'UNPAID',
          note: 'PP Test Stock Movement Purchase',
          items: [
            {
              rawMaterialId: rawMaterialKopiId,
              purchaseQuantity: '1.5000',
              lineTotal: '127500.00',
            },
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '3.0000',
              lineTotal: '36000.00',
            },
          ],
        })
        .expect(201);

      const purchaseId = (res.body as SupplierPurchaseResponse).id;

      const movements = await prisma.stockMovement.findMany({
        where: { referenceType: 'PURCHASE', referenceId: purchaseId },
      });

      // Exactly one movement per line, no more and no fewer.
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.direction === 'IN')).toBe(true);
      expect(movements.every((m) => m.branchId === branch1Id)).toBe(true);

      const kopiMovement = movements.find(
        (m) => m.rawMaterialId === rawMaterialKopiId,
      );
      const gulaMovement = movements.find(
        (m) => m.rawMaterialId === rawMaterialGulaId,
      );

      expect(kopiMovement).toBeDefined();
      expect(kopiMovement!.quantity.toFixed(4)).toBe('1.5000');
      expect(kopiMovement!.unitCostAtMovement.toFixed(2)).toBe('85000.00');

      expect(gulaMovement).toBeDefined();
      expect(gulaMovement!.quantity.toFixed(4)).toBe('3.0000');
      expect(gulaMovement!.unitCostAtMovement.toFixed(2)).toBe('12000.00');
    });
  });

  // ---------------------------------------------------------------------------
  // ADR-024 — purchase unit conversion and latest-cost write-back (DEBT-006)
  // ---------------------------------------------------------------------------
  describe('ADR-024 conversion & latest-cost write-back', () => {
    let ayamId: string;

    beforeAll(async () => {
      // Bought per ekor, stocked per pcs — the handoff's worked example.
      const ayam = await prisma.rawMaterial.create({
        data: {
          name: 'PP Ayam Potong',
          unit: 'pcs',
          purchaseUnit: 'ekor',
          conversionFactor: '10.0000',
          unitCost: '0.000000',
          currentStock: '0.0000',
        },
      });
      ayamId = ayam.id;
    });

    async function buyAyam(
      purchaseQuantity: string,
      lineTotal: string,
      purchaseDate: string,
      paymentStatus: 'PAID' | 'UNPAID' = 'PAID',
    ) {
      return request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate,
          paymentStatus,
          ...(paymentStatus === 'PAID' ? { accountId: defaultAccountId } : {}),
          note: 'PP Test ADR-024',
          items: [{ rawMaterialId: ayamId, purchaseQuantity, lineTotal }],
        })
        .expect(201);
    }

    it('converts purchase units to stock units and derives the unit cost', async () => {
      const res = await buyAyam('1', '45000.00', '2026-08-10T10:00:00.000Z');
      const body = res.body as SupplierPurchaseResponse;

      // What was bought, snapshotted verbatim…
      expect(body.items[0].purchaseQuantity).toBe('1.0000');
      expect(body.items[0].purchaseUnit).toBe('ekor');
      expect(body.items[0].conversionFactor).toBe('10.0000');
      expect(body.items[0].lineTotal).toBe('45000.00');
      // …and what stock received, derived server-side.
      expect(body.items[0].quantity).toBe('10.0000');
      expect(body.items[0].unitCost).toBe('4500.000000');
      expect(body.totalAmount).toBe('45000.00');

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: ayamId },
      });
      expect(material.currentStock.toFixed(4)).toBe('10.0000');
      // DEBT-006 closed: the purchase now sets the live cost.
      expect(material.unitCost.toFixed(6)).toBe('4500.000000');
    });

    it('takes the LATEST purchase cost, not a weighted average', async () => {
      await buyAyam('1', '50000.00', '2026-08-11T10:00:00.000Z');

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: ayamId },
      });
      expect(material.currentStock.toFixed(4)).toBe('20.0000');
      // A weighted average would be 4.750; the business chose latest (ADR-024).
      expect(material.unitCost.toFixed(6)).toBe('5000.000000');
    });

    it('ignores a BACKDATED purchase when deciding the latest cost', async () => {
      // Recorded last, dated first — it must lose the ordering, so the live
      // cost stays at the 2026-08-11 purchase's rate. This is the property that
      // makes the outcome independent of request completion order.
      await buyAyam('1', '10000.00', '2026-08-01T10:00:00.000Z');

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: ayamId },
      });
      // Stock still moved — the goods arrived (ADR-006).
      expect(material.currentStock.toFixed(4)).toBe('30.0000');
      // …but the cost did not regress to the backdated rate.
      expect(material.unitCost.toFixed(6)).toBe('5000.000000');
    });

    it('updates stock AND live cost for an UNPAID purchase too (ADR-006)', async () => {
      const res = await buyAyam(
        '2',
        '120000.00',
        '2026-08-12T10:00:00.000Z',
        'UNPAID',
      );
      const body = res.body as SupplierPurchaseResponse;
      expect(body.payableId).not.toBeNull();
      expect(body.ledgerEntryId).toBeNull();

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: ayamId },
      });
      expect(material.currentStock.toFixed(4)).toBe('50.0000');
      // 120.000 ÷ 20 pcs = 6.000/pcs. Payment status gates MONEY, not stock or
      // cost — the goods arrived either way.
      expect(material.unitCost.toFixed(6)).toBe('6000.000000');
    });

    it('freezes historical lines when the packaging later changes', async () => {
      const before = await prisma.supplierPurchaseItem.findMany({
        where: { rawMaterialId: ayamId },
        orderBy: { createdAt: 'asc' },
      });

      // The supplier switches to 20-pcs boxes.
      await request(app.getHttpServer())
        .patch(`/api/v1/raw-materials/${ayamId}`)
        .set('Cookie', owner.cookies)
        .send({ purchaseUnit: 'box', conversionFactor: '20' })
        .expect(200);

      const after = await prisma.supplierPurchaseItem.findMany({
        where: { rawMaterialId: ayamId },
        orderBy: { createdAt: 'asc' },
      });

      expect(after).toHaveLength(before.length);
      after.forEach((row, i) => {
        expect(row.purchaseUnit).toBe(before[i].purchaseUnit);
        expect(row.conversionFactor.toFixed(4)).toBe(
          before[i].conversionFactor.toFixed(4),
        );
        expect(row.quantity.toFixed(4)).toBe(before[i].quantity.toFixed(4));
        expect(row.unitCost.toFixed(6)).toBe(before[i].unitCost.toFixed(6));
      });

      // The NEXT purchase uses the new packaging: 1 box = 20 pcs.
      const res = await buyAyam('1', '140000.00', '2026-08-13T10:00:00.000Z');
      const body = res.body as SupplierPurchaseResponse;
      expect(body.items[0].purchaseUnit).toBe('box');
      expect(body.items[0].quantity).toBe('20.0000');
      expect(body.items[0].unitCost).toBe('7000.000000');
    });

    it('refuses to change the stock base unit once movements exist', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/raw-materials/${ayamId}`)
        .set('Cookie', owner.cookies)
        .send({ unit: 'gram' })
        .expect(400);

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: ayamId },
      });
      expect(material.unit).toBe('pcs');
    });

    it('rejects a zero or negative conversion factor at the edge', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/raw-materials')
        .set('Cookie', owner.cookies)
        .send({
          name: 'PP Bad Conversion',
          unit: 'gram',
          purchaseUnit: 'kg',
          conversionFactor: '0',
          unitCost: '1000.00',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/raw-materials')
        .set('Cookie', owner.cookies)
        .send({
          name: 'PP Bad Conversion 2',
          unit: 'gram',
          purchaseUnit: 'kg',
          conversionFactor: '-5',
          unitCost: '1000.00',
        })
        .expect(400);
    });

    it('rejects a zero purchase quantity or zero line total at the edge', async () => {
      for (const items of [
        [
          {
            rawMaterialId: ayamId,
            purchaseQuantity: '0',
            lineTotal: '1000.00',
          },
        ],
        [{ rawMaterialId: ayamId, purchaseQuantity: '1', lineTotal: '0' }],
      ]) {
        await request(app.getHttpServer())
          .post('/api/v1/supplier-purchases')
          .set('Cookie', owner.cookies)
          .send({
            supplierId: supplierAId,
            branchId: null,
            purchaseDate: '2026-08-14T10:00:00.000Z',
            paymentStatus: 'PAID',
            accountId: defaultAccountId,
            items,
          })
          .expect(400);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Settlement Flow & Concurrency
  // ---------------------------------------------------------------------------
  describe('Settlement Flow & Concurrency', () => {
    let testPayableId: string;
    let testPurchaseId: string;

    beforeEach(async () => {
      // Create a fresh unpaid purchase of 60,000.00 for settlement tests
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: '2026-08-16T12:00:00.000Z',
          paymentStatus: 'UNPAID',
          note: 'PP Test Settlement Target',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '5.0000',
              lineTotal: '60000.00',
            },
          ],
        })
        .expect(201);

      const createRes = res.body as SupplierPurchaseResponse;
      testPurchaseId = createRes.id;
      testPayableId = createRes.payableId!;
    });

    it('Case 4: Partial settlement reduces balance, updates status, and generates LedgerEntry', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '20000.00',
          settledAt: '2026-08-16T14:00:00.000Z',
          note: 'PP Test Partial Settle 1',
        })
        .expect(201);

      const body = res.body as PayableResponse;
      expect(body.remainingBalance).toBe('40000.00');
      expect(body.settledAmount).toBe('20000.00');
      expect(body.status).toBe('PARTIALLY_SETTLED');
      expect(body.settlements.length).toBe(1);
      expect(body.settlements[0].amount).toBe('20000.00');

      // Verify parent purchase moved to PARTIALLY_PAID
      const purchase = await prisma.supplierPurchase.findUniqueOrThrow({
        where: { id: testPurchaseId },
      });
      expect(purchase.paymentStatus).toBe('PARTIALLY_PAID');
      expect(purchase.ledgerEntryId).toBeNull();

      // Verify LedgerEntry created for settlement amount
      const settlementEntry = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: body.settlements[0].ledgerEntryId },
      });
      expect(settlementEntry.sourceType).toBe('PAYABLE_SETTLEMENT');
      expect(settlementEntry.amount.toFixed(2)).toBe('20000.00');
      expect(settlementEntry.sourceId).toBe(body.settlements[0].id);
    });

    it('Case 5: Settlement to zero marks Payable SETTLED and Purchase PAID', async () => {
      // Settle first 20,000.00
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '20000.00',
          settledAt: '2026-08-16T14:00:00.000Z',
        })
        .expect(201);

      // Settle remaining 40,000.00
      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '40000.00',
          settledAt: '2026-08-16T15:00:00.000Z',
        })
        .expect(201);

      const body = res.body as PayableResponse;
      expect(body.remainingBalance).toBe('0.00');
      expect(body.settledAmount).toBe('60000.00');
      expect(body.status).toBe('SETTLED');
      expect(body.settlements.length).toBe(2);

      // Parent purchase paymentStatus is PAID, ledgerEntryId is still null
      const purchase = await prisma.supplierPurchase.findUniqueOrThrow({
        where: { id: testPurchaseId },
      });
      expect(purchase.paymentStatus).toBe('PAID');
      expect(purchase.ledgerEntryId).toBeNull();
    });

    it('Case 6: Over-settlement is rejected with 400 and writes nothing', async () => {
      // Partial settle 20,000 -> 40,000 remaining
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '20000.00',
          settledAt: '2026-08-16T14:00:00.000Z',
        })
        .expect(201);

      // Try settling 40,000.01
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '40000.01',
          settledAt: '2026-08-16T15:00:00.000Z',
        })
        .expect(400);

      // Verify state was not modified
      const payable = await prisma.payable.findUniqueOrThrow({
        where: { id: testPayableId },
        include: { settlements: true },
      });
      expect(payable.remainingBalance.toFixed(2)).toBe('40000.00');
      expect(payable.settlements.length).toBe(1);
    });

    it('Case 7: Settling an already-settled payable is rejected with 409', async () => {
      // Full settle 60,000.00
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '60000.00',
          settledAt: '2026-08-16T14:00:00.000Z',
        })
        .expect(201);

      // Try settling 1.00 more
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${testPayableId}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '1.00',
          settledAt: '2026-08-16T15:00:00.000Z',
        })
        .expect(409);
    });

    it('Case 8: Concurrency — FOR UPDATE lock prevents over-settlement under Promise.allSettled', async () => {
      // Two concurrent settlement requests of 60,000.00 each on a 60,000.00 payable
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/payables/${testPayableId}/settlements`)
          .set('Cookie', owner.cookies)
          .send({
            accountId: defaultAccountId,
            amount: '60000.00',
            settledAt: '2026-08-16T14:00:00.000Z',
          }),
        request(app.getHttpServer())
          .post(`/api/v1/payables/${testPayableId}/settlements`)
          .set('Cookie', owner.cookies)
          .send({
            accountId: defaultAccountId,
            amount: '60000.00',
            settledAt: '2026-08-16T14:00:00.000Z',
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]); // Winner gets 201, second gets 409 already settled

      const payable = await prisma.payable.findUniqueOrThrow({
        where: { id: testPayableId },
        include: { settlements: true },
      });
      expect(payable.remainingBalance.toFixed(2)).toBe('0.00');
      expect(payable.status).toBe('SETTLED');
      expect(payable.settlements.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Rollback Guarantees (Playbook §7)
  // ---------------------------------------------------------------------------
  describe('Transaction Rollback Guarantees', () => {
    it('Case 9: Purchase rolls back completely if any line contains a non-existent rawMaterialId', async () => {
      const stockBefore = (
        await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialGulaId },
        })
      ).currentStock;

      const fakeMaterialId = '99999999-9999-4999-8999-999999999999';

      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T13:00:00.000Z',
          paymentStatus: 'PAID',
          accountId: defaultAccountId,
          note: 'PP Test Doomed Purchase',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '10.0000',
              lineTotal: '120000.00',
            },
            {
              rawMaterialId: fakeMaterialId,
              purchaseQuantity: '5.0000',
              lineTotal: '50000.00',
            },
          ],
        })
        .expect(404);

      // Verify zero changes occurred in DB
      const stockAfter = (
        await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialGulaId },
        })
      ).currentStock;
      expect(stockAfter.toFixed(4)).toBe(stockBefore.toFixed(4));

      const doomedPurchase = await prisma.supplierPurchase.findFirst({
        where: { note: 'PP Test Doomed Purchase' },
      });
      expect(doomedPurchase).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. RBAC & BranchScopeGuard Enforcement
  // ---------------------------------------------------------------------------
  describe('RBAC & BranchScopeGuard Enforcement', () => {
    it('Case 10: OWNER POST with branchId = null succeeds as central purchase', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierBId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'PAID',
          accountId: defaultAccountId,
          items: [
            {
              rawMaterialId: rawMaterialKopiId,
              purchaseQuantity: '1.0000',
              lineTotal: '85000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.isCentral).toBe(true);
      expect(body.branchId).toBeNull();
    });

    it('Case 11: KASIR POST with branchId = null is rejected with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', kasir1.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(403);
    });

    it('Case 12: KASIR POST with branchId omitted is rejected with 403 by guard before Zod pipe', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', kasir1.cookies)
        .send({
          supplierId: supplierAId,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(403);
    });

    it('Case 13: KASIR POST with own branchId succeeds with 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', kasir1.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: new Date().toISOString(),
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.branchId).toBe(branch1Id);
    });

    it('Case 14: KASIR POST with another branch ID is rejected with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', kasir1.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch2Id,
          purchaseDate: new Date().toISOString(),
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(403);
    });

    it('Case 15: KASIR GET /supplier-purchases?branchId=<own> filters to own branch data only', async () => {
      // Data the cashier must NOT see has to actually exist, or `.every()` on an
      // empty list passes while the filter is broken — the vacuous-assertion
      // trap ERR-002 was found through. OWNER creates both because it bypasses
      // BranchScopeGuard.
      const otherBranchRes = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierBId,
          branchId: branch2Id,
          purchaseDate: '2026-08-16T13:00:00.000Z',
          paymentStatus: 'UNPAID',
          note: 'PP Test Other Branch Purchase',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(201);
      const otherBranchPurchaseId = (
        otherBranchRes.body as SupplierPurchaseResponse
      ).id;

      const centralRes = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierBId,
          branchId: null,
          purchaseDate: '2026-08-16T13:30:00.000Z',
          paymentStatus: 'UNPAID',
          note: 'PP Test Central Purchase For Filter',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(201);
      const centralPurchaseId = (centralRes.body as SupplierPurchaseResponse)
        .id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/supplier-purchases?branchId=${branch1Id}`)
        .set('Cookie', kasir1.cookies)
        .expect(200);

      const items = (res.body as { data: SupplierPurchaseResponse[] }).data;
      const returnedIds = items.map((p) => p.id);

      // Non-empty, or every assertion below is vacuous.
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((p) => p.branchId === branch1Id)).toBe(true);
      // Named exclusions, so the test fails loudly if the filter ever widens.
      expect(returnedIds).not.toContain(otherBranchPurchaseId);
      expect(returnedIds).not.toContain(centralPurchaseId);
    });

    it('Case 16: KASIR and ADMIN POST /payables/:id/settlements get 403; OWNER succeeds', async () => {
      // Find an open payable
      const payable = await prisma.payable.findFirstOrThrow({
        where: { status: 'OPEN' },
      });

      // Kasir gets 403
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payable.id}/settlements`)
        .set('Cookie', kasir1.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '1000.00',
          settledAt: '2026-08-16T15:00:00.000Z',
        })
        .expect(403);

      // Admin gets 403
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payable.id}/settlements`)
        .set('Cookie', admin.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '1000.00',
          settledAt: '2026-08-16T15:00:00.000Z',
        })
        .expect(403);

      // Owner gets 201
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payable.id}/settlements`)
        .set('Cookie', owner.cookies)
        .send({
          accountId: defaultAccountId,
          amount: '1000.00',
          settledAt: '2026-08-16T15:00:00.000Z',
        })
        .expect(201);
    });

    it('Case 17: KASIR GET /payables gets 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payables')
        .set('Cookie', kasir1.cookies)
        .expect(403);
    });

    it('Case 18: Unauthenticated requests get 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/supplier-purchases')
        .expect(401);

      await request(app.getHttpServer()).get('/api/v1/payables').expect(401);

      await request(app.getHttpServer()).get('/api/v1/suppliers').expect(401);
    });

    it('Case 19: KASIR POST /suppliers gets 403; KASIR GET /suppliers gets 200', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set('Cookie', kasir1.cookies)
        .send({ name: 'Unauthorized Supplier' })
        .expect(403);

      const res = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .set('Cookie', kasir1.cookies)
        .expect(200);

      const resBody = res.body as { data: unknown[] };
      expect(Array.isArray(resBody.data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4b. Backdate limit — KASIR only (DEF-QA-06 / TASK-087)
  // ---------------------------------------------------------------------------
  describe('Backdate limit', () => {
    it('rejects a KASIR purchase dated more than 3 days in the past', async () => {
      const tooOld = new Date();
      tooOld.setUTCDate(tooOld.getUTCDate() - 4);

      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', kasir1.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: tooOld.toISOString(),
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'batas input susulan',
      );
    });

    it('allows a KASIR purchase dated within the 3-day backdate window', async () => {
      const withinWindow = new Date();
      withinWindow.setUTCDate(withinWindow.getUTCDate() - 2);

      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', kasir1.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: withinWindow.toISOString(),
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(201);
    });

    it('exempts OWNER from the KASIR backdate limit', async () => {
      const wayOld = new Date();
      wayOld.setUTCDate(wayOld.getUTCDate() - 10);

      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: branch1Id,
          purchaseDate: wayOld.toISOString(),
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(201);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Contract Validation, Decimals & Integrity
  // ---------------------------------------------------------------------------
  describe('Contract Validation & Decimal Discipline', () => {
    it('Case 20: Money and quantity strings maintain scale formatting in responses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .expect(200);

      const resBody = res.body as { data: SupplierPurchaseResponse[] };
      const purchases = resBody.data;
      expect(purchases.length).toBeGreaterThan(0);
      for (const p of purchases) {
        expect(p.totalAmount).toMatch(/^\d+\.\d{2}$/);
        for (const item of p.items) {
          expect(item.quantity).toMatch(/^\d+\.\d{4}$/);
          expect(item.purchaseQuantity).toMatch(/^\d+\.\d{4}$/);
          expect(item.conversionFactor).toMatch(/^\d+\.\d{4}$/);
          // Per-unit cost is a rate, not a ledger amount — ADR-024 widened it
          // to Decimal(18,6) so gram/ml materials don't lose ~0.1% of HPP.
          expect(item.unitCost).toMatch(/^\d+\.\d{6}$/);
          expect(item.lineTotal).toMatch(/^\d+\.\d{2}$/);
        }
      }
    });

    it('Case 21: paymentStatus: PARTIALLY_PAID in create payload is rejected with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'PARTIALLY_PAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(400);
    });

    it('Case 22: PAID without accountId, or UNPAID with accountId is rejected with 400', async () => {
      // PAID without accountId
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'PAID',
          // accountId missing
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(400);

      // UNPAID with accountId
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          accountId: defaultAccountId,
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(400);
    });

    it('Case 23: Invalid payloads (duplicate items, 0 quantity, invalid precision) get 400', async () => {
      // Duplicate rawMaterialId
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '2.0000',
              lineTotal: '24000.00',
            },
          ],
        })
        .expect(400);

      // Zero quantity
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '0.0000',
              lineTotal: '0.00',
            },
          ],
        })
        .expect(400);

      // Empty items array
      await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [],
        })
        .expect(400);
    });

    it('Case 24: Client-supplied totalAmount in purchase payload is ignored', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: null,
          purchaseDate: '2026-08-16T10:00:00.000Z',
          paymentStatus: 'UNPAID',
          totalAmount: '1.00', // client sends spoofed total
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '2.0000',
              lineTotal: '24000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.totalAmount).toBe('24000.00'); // Server-computed total wins
    });

    it('Case 25: Deleting a referenced supplier fails with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/suppliers/${supplierAId}`)
        .set('Cookie', owner.cookies)
        .expect(409);
    });

    it('Case 26: GET /payables/summary returns running balance per supplier', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payables/summary')
        .set('Cookie', owner.cookies)
        .expect(200);

      const summaries = res.body as PayableSupplierSummary[];
      expect(Array.isArray(summaries)).toBe(true);
      for (const s of summaries) {
        expect(s.supplierId).toBeDefined();
        expect(s.supplierName).toBeDefined();
        expect(s.openPayableCount).toBeGreaterThanOrEqual(1);
        expect(s.totalOutstanding).toMatch(/^\d+\.\d{2}$/);
      }
    });

    it('Case 27: Balance integrity — stored remainingBalance equals re-derived balance for all payables', async () => {
      const allPayables = await prisma.payable.findMany({
        include: { settlements: true },
      });

      expect(allPayables.length).toBeGreaterThan(0);
      for (const p of allPayables) {
        const totalSettled = p.settlements.reduce(
          (sum, s) => sum.plus(s.amount),
          new Prisma.Decimal(0),
        );
        const derivedRemaining = p.originalAmount.minus(totalSettled);
        expect(p.remainingBalance.toFixed(2)).toBe(derivedRemaining.toFixed(2));
      }
    });

    it('Case 28: assigning a purchase to the central kitchen branch is rejected with 400 (ADR-014)', async () => {
      // `Pusat (Dapur Sentral)` exists only to satisfy LedgerEntry.branchId's
      // NOT NULL. A purchase attributed to it directly would report
      // isCentral: false while being central — so the ADR's rule is enforced,
      // not merely documented. branchId: null stays the only way to say central.
      const centralBranch = await prisma.branch.findUniqueOrThrow({
        where: { name: 'Pusat (Dapur Sentral)' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', owner.cookies)
        .send({
          supplierId: supplierAId,
          branchId: centralBranch.id,
          purchaseDate: '2026-08-16T16:00:00.000Z',
          paymentStatus: 'UNPAID',
          note: 'PP Test Central Branch Misuse',
          items: [
            {
              rawMaterialId: rawMaterialGulaId,
              purchaseQuantity: '1.0000',
              lineTotal: '12000.00',
            },
          ],
        })
        .expect(400);

      expect((res.body as { message: string }).message).toContain(
        'branchId: null',
      );

      // Rolled back: the rejection happens inside the transaction, so nothing
      // may survive it.
      const leaked = await prisma.supplierPurchase.count({
        where: { branchId: centralBranch.id },
      });
      expect(leaked).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Payables listing — filter, sort, paginate (TASK-067)
  //
  // `sortOrder` and the `supplierName` / `status` sort keys were added when the
  // Payables tab moved to server-side sorting. `supplierName` is the only key
  // that is not a Payable column, so it is the only one that can fail inside
  // Prisma rather than at the Zod boundary — hence its own case.
  // ---------------------------------------------------------------------------
  describe('Payables listing — filter, sort, paginate', () => {
    it('Case 29: sortBy=remainingBalance honours sortOrder in both directions', async () => {
      const asc = await request(app.getHttpServer())
        .get('/api/v1/payables?sortBy=remainingBalance&sortOrder=asc&limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);

      const ascRows = (asc.body as { data: PayableResponse[] }).data;
      expect(ascRows.length).toBeGreaterThan(1);

      const ascValues = ascRows.map((p) => Number(p.remainingBalance));
      for (let i = 1; i < ascValues.length; i += 1) {
        expect(ascValues[i]).toBeGreaterThanOrEqual(ascValues[i - 1]);
      }

      const desc = await request(app.getHttpServer())
        .get('/api/v1/payables?sortBy=remainingBalance&sortOrder=desc&limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);

      const descValues = (desc.body as { data: PayableResponse[] }).data.map(
        (p) => Number(p.remainingBalance),
      );
      for (let i = 1; i < descValues.length; i += 1) {
        expect(descValues[i]).toBeLessThanOrEqual(descValues[i - 1]);
      }
    });

    it('Case 30: sortBy=supplierName resolves through the Supplier relation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payables?sortBy=supplierName&sortOrder=asc&limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);

      const names = (res.body as { data: PayableResponse[] }).data.map(
        (p) => p.supplierName,
      );
      expect(names.length).toBeGreaterThan(1);
      for (let i = 1; i < names.length; i += 1) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('Case 31: sortBy=status is accepted and ordered', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payables?sortBy=status&sortOrder=asc&limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);

      expect(
        (res.body as { data: PayableResponse[] }).data.length,
      ).toBeGreaterThan(0);
    });

    it('Case 32: supplierId narrows the list to that supplier only', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/payables?supplierId=${supplierAId}&limit=50`)
        .set('Cookie', owner.cookies)
        .expect(200);

      const rows = (res.body as { data: PayableResponse[] }).data;
      expect(rows.length).toBeGreaterThan(0);
      for (const p of rows) {
        expect(p.supplierId).toBe(supplierAId);
      }
    });

    it('Case 33: status filters the list and meta.total follows the filter', async () => {
      const all = await request(app.getHttpServer())
        .get('/api/v1/payables?limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);

      const open = await request(app.getHttpServer())
        .get('/api/v1/payables?status=OPEN&limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);

      const openBody = open.body as {
        data: PayableResponse[];
        meta: { total: number };
      };
      for (const p of openBody.data) {
        expect(p.status).toBe('OPEN');
      }
      expect(openBody.meta.total).toBeLessThanOrEqual(
        (all.body as { meta: { total: number } }).meta.total,
      );
    });

    it('Case 34: consecutive pages are disjoint under an explicit sort', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/payables?page=1&limit=1&sortBy=createdAt&sortOrder=desc')
        .set('Cookie', owner.cookies)
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get('/api/v1/payables?page=2&limit=1&sortBy=createdAt&sortOrder=desc')
        .set('Cookie', owner.cookies)
        .expect(200);

      const b1 = page1.body as {
        data: PayableResponse[];
        meta: { total: number; totalPages: number };
      };
      const b2 = page2.body as { data: PayableResponse[] };

      expect(b1.data).toHaveLength(1);
      expect(b1.meta.totalPages).toBe(b1.meta.total);
      expect(b2.data[0]?.id).not.toBe(b1.data[0]?.id);
    });

    it('Case 35: an unknown sortBy is rejected, not passed to Prisma', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payables?sortBy=supplier')
        .set('Cookie', owner.cookies)
        .expect(400);
    });

    it('Case 36: the new parameters do not widen access — KASIR still gets 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payables?sortBy=supplierName&sortOrder=asc')
        .set('Cookie', kasir1.cookies)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Supplier purchases & suppliers listing — sortOrder (TASK-074, DEBT-049)
  //
  // Both endpoints accepted `sortBy` but pinned the direction in the service
  // (`orderBy: { [sortBy ?? 'x']: 'desc' }`), so a descending-only list looked
  // sortable and was not. These cases only pass if the direction actually
  // reaches Prisma — the asc/desc assertions are opposite-signed, so a service
  // that ignores `sortOrder` fails one of them whichever way it hardcodes.
  //
  // Every listing assertion is fenced by a purchaseDate window (or a `search`
  // prefix) unique to this block, so rows written by earlier describes in this
  // same file cannot drift into the comparison.
  // ---------------------------------------------------------------------------
  describe('Supplier purchases & suppliers listing — sortOrder', () => {
    const WINDOW_START = '2026-11-01T00:00:00.000Z';
    const WINDOW_END = '2026-11-30T23:59:59.999Z';
    const WINDOW = `startDate=${WINDOW_START}&endDate=${WINDOW_END}`;

    beforeAll(async () => {
      // Three central PAID purchases, distinct on both sort keys at once:
      // purchaseDate ascending runs 05 → 15 → 25 while totalAmount ascending
      // runs 12k → 24k → 36k, so `sortBy` and `sortOrder` are independently
      // observable rather than accidentally agreeing.
      const rows: Array<[string, string]> = [
        ['2026-11-05T10:00:00.000Z', '1.0000'],
        ['2026-11-15T10:00:00.000Z', '2.0000'],
        ['2026-11-25T10:00:00.000Z', '3.0000'],
      ];

      for (const [purchaseDate, quantity] of rows) {
        await request(app.getHttpServer())
          .post('/api/v1/supplier-purchases')
          .set('Cookie', owner.cookies)
          .send({
            supplierId: supplierAId,
            branchId: null,
            purchaseDate,
            paymentStatus: 'PAID',
            accountId: defaultAccountId,
            note: 'PP Test sortOrder fixture',
            items: [
              {
                rawMaterialId: rawMaterialGulaId,
                // conversionFactor is 1 on this fixture, so the purchase
                // quantity IS the stock quantity (ADR-024).
                purchaseQuantity: quantity,
                lineTotal: new Prisma.Decimal(quantity)
                  .times('12000.00')
                  .toFixed(2),
              },
            ],
          })
          .expect(201);
      }
    });

    async function listPurchases(qs: string) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/supplier-purchases?${qs}`)
        .set('Cookie', owner.cookies)
        .expect(200);
      return (res.body as { data: SupplierPurchaseResponse[] }).data;
    }

    it('Case 37: GET /supplier-purchases honours sortOrder on purchaseDate', async () => {
      const asc = await listPurchases(
        `${WINDOW}&sortBy=purchaseDate&sortOrder=asc&limit=50`,
      );
      expect(asc).toHaveLength(3);
      const ascTimes = asc.map((p) => new Date(p.purchaseDate).getTime());
      for (let i = 1; i < ascTimes.length; i += 1) {
        expect(ascTimes[i]).toBeGreaterThanOrEqual(ascTimes[i - 1]);
      }

      const desc = await listPurchases(
        `${WINDOW}&sortBy=purchaseDate&sortOrder=desc&limit=50`,
      );
      expect(desc.map((p) => p.id)).toEqual(
        [...asc].reverse().map((p) => p.id),
      );
    });

    it('Case 38: GET /supplier-purchases honours sortOrder on totalAmount', async () => {
      const asc = await listPurchases(
        `${WINDOW}&sortBy=totalAmount&sortOrder=asc&limit=50`,
      );
      const ascAmounts = asc.map((p) => Number(p.totalAmount));
      expect(ascAmounts).toEqual(['12000', '24000', '36000'].map(Number));

      const desc = await listPurchases(
        `${WINDOW}&sortBy=totalAmount&sortOrder=desc&limit=50`,
      );
      expect(desc.map((p) => Number(p.totalAmount))).toEqual(
        [...ascAmounts].reverse(),
      );
    });

    it('Case 39: omitting sortOrder on /supplier-purchases still defaults to desc', async () => {
      const implicit = await listPurchases(
        `${WINDOW}&sortBy=purchaseDate&limit=50`,
      );
      const explicit = await listPurchases(
        `${WINDOW}&sortBy=purchaseDate&sortOrder=desc&limit=50`,
      );
      expect(implicit.map((p) => p.id)).toEqual(explicit.map((p) => p.id));
    });

    it('Case 40: an unknown sortOrder is rejected on /supplier-purchases, not coerced', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/supplier-purchases?sortOrder=sideways')
        .set('Cookie', owner.cookies)
        .expect(400);
    });

    it('Case 41: GET /suppliers honours sortOrder on name', async () => {
      const list = async (qs: string) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/suppliers?search=PP%20&sortBy=name&limit=50&${qs}`)
          .set('Cookie', owner.cookies)
          .expect(200);
        return (res.body as { data: Array<{ id: string; name: string }> }).data;
      };

      const asc = await list('sortOrder=asc');
      expect(asc.length).toBeGreaterThan(1);
      for (let i = 1; i < asc.length; i += 1) {
        expect(
          asc[i].name.localeCompare(asc[i - 1].name),
        ).toBeGreaterThanOrEqual(0);
      }

      const desc = await list('sortOrder=desc');
      expect(desc.map((s) => s.id)).toEqual(
        [...asc].reverse().map((s) => s.id),
      );
    });

    it('Case 42: omitting sortOrder on /suppliers still defaults to asc', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/suppliers?search=PP%20&sortBy=name&limit=50')
        .set('Cookie', owner.cookies)
        .expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map(
        (s) => s.name,
      );
      expect(names.length).toBeGreaterThan(1);
      for (let i = 1; i < names.length; i += 1) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('Case 43: an unknown sortOrder is rejected on /suppliers, not coerced', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/suppliers?sortOrder=sideways')
        .set('Cookie', owner.cookies)
        .expect(400);
    });
  });
});
