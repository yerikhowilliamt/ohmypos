import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  AllocationResponse,
  DailyIncomeResponse,
  IncomeByPaymentMethodResponse,
  InventorySummaryResponse,
  ProductProfitResponse,
  ProductWithHppResponse,
  ProfitLossResponse,
  RawMaterialResponse,
  ReconciliationSummary,
  SaleResponse,
  SupplierPurchaseResponse,
  TopProductsResponse,
  UpsertOpeningStockResponse,
} from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { resetDatabase } from './reset-database';

/**
 * OhMyPos — the PRD §9 success criterion, as an executable test.
 *
 * "At least one full monthly cycle (opening stock -> sales -> purchases ->
 * closing stock) runs end-to-end without manual data correction."
 *
 * TWO RULES FOR ANYONE EDITING THIS FILE:
 *
 * 1. Every cycle ACTION goes through HTTP. Prisma appears only in beforeAll
 *    (master-data fixtures) and in assertions (reading state back). A stage
 *    stitched together with prisma.sale.create proves nothing about the product.
 *
 * 2. Every expected figure is a hand-computed literal, derived independently
 *    from the PRD/ADR definitions — never by calling the code under test. The
 *    arithmetic is written out in docs/plannings/2026-08-21-phase-14-verification-hardening.md
 *    section 4.3.
 *
 * Month is 2026-07 because CreateSaleSchema rejects a future soldAt
 * (sale.schema.ts:47) and "today" is well into 2026-08. Do not "modernise"
 * these dates.
 *
 * Stage 8's numbers assume Phase 14 Gate 1 has landed (ADR-023 — inventory
 * period boundaries resolve in Asia/Jakarta, delegating to common/period.ts,
 * the same as every report). Before that fix, this stage fails on the July
 * 31 23:30 WIB sale (S6): reports place it in July, inventory places it in
 * August. That failure IS the finding the plan's §2.1 documents — it is not
 * a bug in this test.
 */
jest.setTimeout(120_000);

describe('Monthly financial cycle (e2e) — PRD §9', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPass123!';
  let ownerCookies: string[];

  let pusatBranchId: string;
  let kemangBranchId: string;
  let senopatiBranchId: string;

  let kasLaciId: string;
  let qrisId: string;
  let bankBcaId: string;

  let operasionalCategoryId: string;

  let kopiId: string;
  let susuId: string;
  let gulaId: string;

  let kopiSusuId: string;
  let tehManisId: string;

  let supplierId: string;

  // Threaded from Stage 2/3 into Stage 6's explicit allocations.
  let p1LedgerEntryId: string;
  let p3LedgerEntryId: string;
  let e1LedgerEntryId: string;
  let e2LedgerEntryId: string;

  // Threaded from Stage 2 into Stage 5's settlements.
  let payableId: string;

  // Threaded from Stage 7 into Stage 9's immutability check.
  let stage7ProfitLoss: ProfitLossResponse;
  let stage7ProductProfit: ProductProfitResponse;

  /**
   * Rule 1's tripwire (Stage 10). Incremented once per successful cycle
   * action that goes through HTTP — Stage 1's PUT, Stage 2-6's POSTs. Failed
   * attempts (the 409/400 probes) and Stage 9's master-data edit are
   * deliberately NOT counted; see Stage 10 for why.
   */
  let httpMutationCount = 0;

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

    // ── Branches (ADR-014 requires the central-purchase attribution branch
    //    to exist under this exact name — system-refs.ts's CENTRAL_BRANCH_NAME) ──
    const pusat = await prisma.branch.create({
      data: { name: 'Umum', isSystem: true },
    });
    const kemang = await prisma.branch.create({
      data: { name: 'Cabang Kemang' },
    });
    const senopati = await prisma.branch.create({
      data: { name: 'Cabang Senopati' },
    });
    pusatBranchId = pusat.id;
    kemangBranchId = kemang.id;
    senopatiBranchId = senopati.id;

    // ── Accounts ──
    const kasLaci = await prisma.account.create({
      data: { name: 'Kas Laci', type: 'CASH', openingBalance: '0' },
    });
    const qris = await prisma.account.create({
      data: { name: 'QRIS Merchant', type: 'EWALLET', openingBalance: '0' },
    });
    const bankBca = await prisma.account.create({
      data: { name: 'Bank BCA', type: 'BANK', openingBalance: '0' },
    });
    kasLaciId = kasLaci.id;
    qrisId = qris.id;
    bankBcaId = bankBca.id;

    // ── Categories (system-refs.ts requires 'Penjualan' and 'Pembelian Bahan
    //    Baku' to exist under those exact names — Sale/SupplierPurchase
    //    resolve their ledger category by name, not by a request field) ──
    await prisma.category.create({
      data: { name: 'Penjualan', type: 'INFLOW' },
    });
    await prisma.category.create({
      data: { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' },
    });
    const operasional = await prisma.category.create({
      data: { name: 'Operasional', type: 'OUTFLOW' },
    });
    operasionalCategoryId = operasional.id;

    // ── Users ──
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({
      data: [
        {
          name: 'Cycle Owner',
          email: 'cycle-owner@test.local',
          passwordHash,
          role: 'OWNER',
        },
        {
          name: 'Cycle Kasir Kemang',
          email: 'cycle-kasir-a@test.local',
          passwordHash,
          role: 'KASIR',
          branchId: kemangBranchId,
        },
        {
          name: 'Cycle Kasir Senopati',
          email: 'cycle-kasir-b@test.local',
          passwordHash,
          role: 'KASIR',
          branchId: senopatiBranchId,
        },
      ],
    });

    const ownerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cycle-owner@test.local', password })
      .expect(200);
    ownerCookies = ownerLogin.get('Set-Cookie') ?? [];

    // ── Raw materials ──
    const kopi = await prisma.rawMaterial.create({
      data: {
        name: 'Kopi',
        unit: 'kg',
        purchaseUnit: 'kg',
        unitCost: '120000.00',
        lowStockThreshold: '1.0000',
      },
    });
    const susu = await prisma.rawMaterial.create({
      data: {
        name: 'Susu',
        unit: 'liter',
        purchaseUnit: 'liter',
        unitCost: '18000.00',
        lowStockThreshold: '2.0000',
      },
    });
    const gula = await prisma.rawMaterial.create({
      data: {
        name: 'Gula',
        unit: 'kg',
        purchaseUnit: 'kg',
        unitCost: '14000.00',
        lowStockThreshold: '1.0000',
      },
    });
    kopiId = kopi.id;
    susuId = susu.id;
    gulaId = gula.id;

    // ── Products & recipes ──
    // HPP at creation: Kopi Susu = 0.02*120000 + 0.15*18000 + 0.015*14000 = 5310.00
    //                 Teh Manis = 0.025*14000 = 350.00
    //
    // Stage 2's purchases reprice every material before Stage 4's sales run
    // (ADR-024: a purchase writes its normalized unit cost back to the raw
    // material), so the HPP snapshotted onto each SaleItem is the POST-purchase
    // one: kopi 125000, susu 18500, gula 15500 →
    //   Kopi Susu = 0.02*125000 + 0.15*18500 + 0.015*15500 = 5507.50
    //   Teh Manis = 0.025*15500 = 387.50
    const kopiSusu = await prisma.product.create({
      data: { name: 'Kopi Susu', sellPrice: '25000.00' },
    });
    const tehManis = await prisma.product.create({
      data: { name: 'Teh Manis', sellPrice: '10000.00' },
    });
    kopiSusuId = kopiSusu.id;
    tehManisId = tehManis.id;

    await prisma.recipeItem.createMany({
      data: [
        {
          productId: kopiSusuId,
          rawMaterialId: kopiId,
          quantityUsed: '0.0200',
        },
        {
          productId: kopiSusuId,
          rawMaterialId: susuId,
          quantityUsed: '0.1500',
        },
        {
          productId: kopiSusuId,
          rawMaterialId: gulaId,
          quantityUsed: '0.0150',
        },
        {
          productId: tehManisId,
          rawMaterialId: gulaId,
          quantityUsed: '0.0250',
        },
      ],
    });

    // ── Supplier ──
    const supplier = await prisma.supplier.create({
      data: { name: 'PT Bahan Segar' },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 1 — Opening stock
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 1 — opening stock', () => {
    it('declares July opening stock for all three materials', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .put('/api/v1/inventory/opening-stock')
        .set('Cookie', ownerCookies)
        .send({
          periodMonth: '2026-07',
          entries: [
            {
              rawMaterialId: kopiId,
              quantity: '5.0000',
              unitPrice: '120000.00',
            },
            {
              rawMaterialId: susuId,
              quantity: '20.0000',
              unitPrice: '18000.00',
            },
            {
              rawMaterialId: gulaId,
              quantity: '10.0000',
              unitPrice: '14000.00',
            },
          ],
        })
        .expect(200);

      const body = res.body as UpsertOpeningStockResponse;
      expect(body.data).toHaveLength(3);

      const kopi = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: kopiId },
      });
      const susu = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: susuId },
      });
      const gula = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: gulaId },
      });
      expect(kopi.currentStock.toFixed(4)).toBe('5.0000');
      expect(susu.currentStock.toFixed(4)).toBe('20.0000');
      expect(gula.currentStock.toFixed(4)).toBe('10.0000');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 2 — Purchases
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 2 — purchases', () => {
    it('P1: central, PAID — Kopi + Susu, one ledger entry attributed to Pusat', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', ownerCookies)
        .send({
          supplierId,
          branchId: null,
          purchaseDate: '2026-07-05T03:00:00.000Z',
          paymentStatus: 'PAID',
          accountId: bankBcaId,
          items: [
            {
              rawMaterialId: kopiId,
              purchaseQuantity: '3.0000',
              lineTotal: '375000.00',
            },
            {
              rawMaterialId: susuId,
              purchaseQuantity: '10.0000',
              lineTotal: '185000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.branchId).toBeNull();
      expect(body.isCentral).toBe(true);
      expect(body.totalAmount).toBe('560000.00');
      expect(body.ledgerEntryId).not.toBeNull();
      expect(body.payableId).toBeNull();
      p1LedgerEntryId = body.ledgerEntryId as string;

      const entry = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: p1LedgerEntryId },
      });
      expect(entry.branchId).toBe(pusatBranchId);
      expect(entry.type).toBe('OUTFLOW');
      expect(entry.sourceType).toBe('PURCHASE');
    });

    it('P2: central, UNPAID — Gula, zero ledger entries, one Payable', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', ownerCookies)
        .send({
          supplierId,
          branchId: null,
          purchaseDate: '2026-07-12T03:00:00.000Z',
          paymentStatus: 'UNPAID',
          items: [
            {
              rawMaterialId: gulaId,
              purchaseQuantity: '8.0000',
              lineTotal: '120000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.totalAmount).toBe('120000.00');
      expect(body.ledgerEntryId).toBeNull();
      expect(body.payableId).not.toBeNull();
      payableId = body.payableId as string;

      const payable = await prisma.payable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(payable.remainingBalance.toFixed(2)).toBe('120000.00');
      expect(payable.status).toBe('OPEN');
    });

    it('P3: Cabang Kemang, PAID — Gula, one ledger entry attributed to Kemang', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/supplier-purchases')
        .set('Cookie', ownerCookies)
        .send({
          supplierId,
          branchId: kemangBranchId,
          purchaseDate: '2026-07-18T03:00:00.000Z',
          paymentStatus: 'PAID',
          accountId: bankBcaId,
          items: [
            {
              rawMaterialId: gulaId,
              purchaseQuantity: '2.0000',
              lineTotal: '31000.00',
            },
          ],
        })
        .expect(201);

      const body = res.body as SupplierPurchaseResponse;
      expect(body.branchId).toBe(kemangBranchId);
      expect(body.totalAmount).toBe('31000.00');
      expect(body.ledgerEntryId).not.toBeNull();
      p3LedgerEntryId = body.ledgerEntryId as string;

      const entry = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: p3LedgerEntryId },
      });
      expect(entry.branchId).toBe(kemangBranchId);

      // P1 and P3 are the only PAID purchases this stage — exactly two
      // PURCHASE-sourced ledger entries should exist by now.
      const purchaseEntryCount = await prisma.ledgerEntry.count({
        where: { sourceType: 'PURCHASE' },
      });
      expect(purchaseEntryCount).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 3 — Manual expenses
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 3 — manual expenses', () => {
    it('E1: Sewa, Cabang Kemang, 150000.00', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', ownerCookies)
        .send({
          accountId: bankBcaId,
          categoryId: operasionalCategoryId,
          branchId: kemangBranchId,
          entryDate: '2026-07-03T03:00:00.000Z',
          amount: '150000.00',
          type: 'OUTFLOW',
        })
        .expect(201);

      e1LedgerEntryId = (res.body as { id: string }).id;
    });

    it('E2: Listrik, Cabang Senopati, 40000.00', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', ownerCookies)
        .send({
          accountId: bankBcaId,
          categoryId: operasionalCategoryId,
          branchId: senopatiBranchId,
          entryDate: '2026-07-25T03:00:00.000Z',
          amount: '40000.00',
          type: 'OUTFLOW',
        })
        .expect(201);

      e2LedgerEntryId = (res.body as { id: string }).id;
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 4 — Sales
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 4 — sales', () => {
    it('S1: Kemang, Kas Laci, Kopi Susu x2 — 50000.00', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', ownerCookies)
        .send({
          branchId: kemangBranchId,
          accountId: kasLaciId,
          soldAt: '2026-07-01T02:00:00.000Z',
          items: [{ productId: kopiSusuId, quantity: '2' }],
        })
        .expect(201);

      expect((res.body as SaleResponse).totalAmount).toBe('50000.00');
    });

    it('S2: Senopati, QRIS, Teh Manis x3 — 30000.00', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', ownerCookies)
        .send({
          branchId: senopatiBranchId,
          accountId: qrisId,
          soldAt: '2026-07-01T03:00:00.000Z',
          items: [{ productId: tehManisId, quantity: '3' }],
        })
        .expect(201);

      expect((res.body as SaleResponse).totalAmount).toBe('30000.00');
    });

    it('S3: Kemang, QRIS, Kopi Susu x1 + Teh Manis x2 — 45000.00', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', ownerCookies)
        .send({
          branchId: kemangBranchId,
          accountId: qrisId,
          soldAt: '2026-07-15T07:00:00.000Z',
          items: [
            { productId: kopiSusuId, quantity: '1' },
            { productId: tehManisId, quantity: '2' },
          ],
        })
        .expect(201);

      expect((res.body as SaleResponse).totalAmount).toBe('45000.00');
    });

    it('S4: Senopati, Kas Laci, Kopi Susu x4 @ override 22000.00 — 88000.00', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', ownerCookies)
        .send({
          branchId: senopatiBranchId,
          accountId: kasLaciId,
          soldAt: '2026-07-20T04:00:00.000Z',
          items: [
            { productId: kopiSusuId, quantity: '4', unitPrice: '22000.00' },
          ],
        })
        .expect(201);

      const body = res.body as SaleResponse;
      expect(body.totalAmount).toBe('88000.00');
      expect(body.items[0].isPriceOverridden).toBe(true);
      expect(body.items[0].unitPriceAtSale).toBe('22000.00');
    });

    it('S5: Kemang, QRIS, Teh Manis x2 — 20000.00 (last sale INSIDE July WIB)', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', ownerCookies)
        .send({
          branchId: kemangBranchId,
          accountId: qrisId,
          soldAt: '2026-07-31T16:30:00.000Z',
          items: [{ productId: tehManisId, quantity: '2' }],
        })
        .expect(201);

      expect((res.body as SaleResponse).totalAmount).toBe('20000.00');
    });

    it('S6: Kemang, Kas Laci, Kopi Susu x1 — the boundary probe (WIB Aug 1 00:30)', async () => {
      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', ownerCookies)
        .send({
          branchId: kemangBranchId,
          accountId: kasLaciId,
          soldAt: '2026-07-31T17:30:00.000Z',
          items: [{ productId: kopiSusuId, quantity: '1' }],
        })
        .expect(201);

      expect((res.body as SaleResponse).totalAmount).toBe('25000.00');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 5 — Payable settlement
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 5 — payable settlement', () => {
    it('T1: partial settlement of 50000.00 leaves 70000.00 remaining', async () => {
      const before = await prisma.ledgerEntry.count({
        where: { sourceType: 'PAYABLE_SETTLEMENT' },
      });
      expect(before).toBe(0);

      httpMutationCount++;
      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/settlements`)
        .set('Cookie', ownerCookies)
        .send({
          accountId: bankBcaId,
          amount: '50000.00',
          settledAt: '2026-07-22T03:00:00.000Z',
        })
        .expect(201);

      // settle() returns the updated Payable itself (toPayableResponse),
      // whose `id` IS the payable id — not a PayableSettlementResponse
      // wrapper with a `payableId` field.
      expect((res.body as { id: string }).id).toBe(payableId);
      expect((res.body as { remainingBalance: string }).remainingBalance).toBe(
        '70000.00',
      );

      const payable = await prisma.payable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(payable.remainingBalance.toFixed(2)).toBe('70000.00');
      // NOT 'PARTIALLY_PAID' — that literal belongs to
      // SupplierPurchase.paymentStatus. Payable.status is PayableStatus,
      // whose partial value is PARTIALLY_SETTLED (enums.ts).
      expect(payable.status).toBe('PARTIALLY_SETTLED');
    });

    it('T2: settling the remaining 70000.00 closes the payable', async () => {
      httpMutationCount++;
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/settlements`)
        .set('Cookie', ownerCookies)
        .send({
          accountId: bankBcaId,
          amount: '70000.00',
          settledAt: '2026-07-28T03:00:00.000Z',
        })
        .expect(201);

      const payable = await prisma.payable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(payable.remainingBalance.toFixed(2)).toBe('0.00');
      expect(payable.status).toBe('SETTLED');

      const settlementEntries = await prisma.ledgerEntry.findMany({
        where: { sourceType: 'PAYABLE_SETTLEMENT' },
      });
      expect(settlementEntries).toHaveLength(2);
      const sum = settlementEntries.reduce(
        (total, e) => total.plus(e.amount),
        new Prisma.Decimal(0),
      );
      expect(sum.toFixed(2)).toBe('120000.00');
    });

    it('T3: a third settlement of 0.01 on the now-settled payable is rejected', async () => {
      // Deliberately NOT routed through the counted wrapper — this call is
      // expected to fail, and Stage 10's tripwire only counts successful
      // cycle actions (see EXPECTED_HTTP_MUTATIONS' comment).
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/settlements`)
        .set('Cookie', ownerCookies)
        .send({
          accountId: bankBcaId,
          amount: '0.01',
          settledAt: '2026-07-29T03:00:00.000Z',
        })
        .expect(409);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 6 — Reconciliation
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 6 — reconciliation', () => {
    const csv = [
      '03/07/2026,SEWA RUKO,0000,150000.00,DB',
      '05/07/2026,PEMBELIAN BAHAN,0000,560000.00,DB',
      '18/07/2026,PEMBELIAN GAS,0000,31000.00,DB',
      '25/07/2026,TAGIHAN LISTRIK,0000,40000.00,DB',
    ].join('\n');

    it('imports 4 bank transactions from the CSV, then dedups a re-import', async () => {
      httpMutationCount++;
      const first = await request(app.getHttpServer())
        .post(`/api/v1/import/csv/${bankBcaId}?format=BCA`)
        .set('Cookie', ownerCookies)
        .attach('file', Buffer.from(csv, 'utf-8'), 'statement.csv')
        .expect(200);
      expect(first.body).toEqual({ imported: 4, skipped: 0, total: 4 });

      httpMutationCount++;
      const second = await request(app.getHttpServer())
        .post(`/api/v1/import/csv/${bankBcaId}?format=BCA`)
        .set('Cookie', ownerCookies)
        .attach('file', Buffer.from(csv, 'utf-8'), 'statement.csv')
        .expect(200);
      expect(second.body).toEqual({ imported: 0, skipped: 4, total: 4 });
    });

    it('proposes at least one match candidate (smoke only — ranking is not asserted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/matching/propose')
        .set('Cookie', ownerCookies)
        .send({ accountId: bankBcaId })
        .expect(200);

      const body = res.body as { candidates: unknown[]; truncated: boolean };
      expect(Array.isArray(body.candidates)).toBe(true);
      expect(body.candidates.length).toBeGreaterThan(0);
    });

    it('allocates each bank transaction explicitly against its matching ledger entry', async () => {
      const bankTxns = await prisma.bankTransaction.findMany({
        where: { accountId: bankBcaId },
      });
      const byAmount = new Map(
        bankTxns.map((t) => [t.amount.toFixed(2), t.id]),
      );

      const pairs: Array<[string, string]> = [
        [byAmount.get('150000.00')!, e1LedgerEntryId],
        [byAmount.get('560000.00')!, p1LedgerEntryId],
        [byAmount.get('31000.00')!, p3LedgerEntryId],
        [byAmount.get('40000.00')!, e2LedgerEntryId],
      ];

      for (const [bankTransactionId, ledgerEntryId] of pairs) {
        expect(bankTransactionId).toBeDefined();
        httpMutationCount++;
        const res = await request(app.getHttpServer())
          .post('/api/v1/allocations')
          .set('Cookie', ownerCookies)
          .send({
            bankTransactionId,
            ledgerEntryId,
            amountPortion: (
              await prisma.bankTransaction.findUniqueOrThrow({
                where: { id: bankTransactionId },
              })
            ).amount.toFixed(2),
          })
          .expect(201);
        expect((res.body as AllocationResponse[])[0].status).toBe('ACTIVE');
      }

      const matchedCount = await prisma.bankTransaction.count({
        where: { accountId: bankBcaId, status: 'MATCHED' },
      });
      expect(matchedCount).toBe(4);
    });

    it('rejects a fifth allocation that would exceed an already-fully-allocated transaction', async () => {
      const fullyAllocated = await prisma.bankTransaction.findFirstOrThrow({
        where: { accountId: bankBcaId, amount: '150000.00' },
      });

      await request(app.getHttpServer())
        .post('/api/v1/allocations')
        .set('Cookie', ownerCookies)
        .send({
          bankTransactionId: fullyAllocated.id,
          ledgerEntryId: e1LedgerEntryId,
          amountPortion: '0.01',
        })
        .expect(400);
    });

    it('reconciliation summary reports actualBankBalance = -781000.00', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reconciliation/summary?accountId=${bankBcaId}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as ReconciliationSummary;
      // bankIn(0) - bankOut(150000+560000+31000+40000) = -781000.00
      // (reconciliation.service.ts:72 — verified against source, not assumed).
      expect(body.actualBankBalance).toBe('-781000.00');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 7 — Closing reports
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 7 — closing reports', () => {
    const range = 'startDate=2026-07-01&endDate=2026-07-31';

    it('profit-loss matches the hand-computed July figures', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/profit-loss?${range}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as ProfitLossResponse;
      stage7ProfitLoss = body;

      expect(body.salesRevenue).toBe('233000.00');
      expect(body.otherIncome).toBe('0.00');
      expect(body.totalIncome).toBe('233000.00');
      // 7 * 5507.50 + 7 * 387.50 — post-purchase HPP, see the recipe note above.
      expect(body.cogs).toBe('41265.00');
      expect(body.grossProfit).toBe('191735.00');
      expect(body.operatingExpenses).toBe('190000.00');
      expect(body.netProfit).toBe('1735.00');
      expect(body.netMarginPct).toBe(0.74);
      expect(body.cash.totalInflow).toBe('233000.00');
      expect(body.cash.totalOutflow).toBe('901000.00');
      expect(body.cash.materialCashOutflow).toBe('711000.00');
      expect(body.cash.netCashFlow).toBe('-668000.00');
      expect(body.saleCount).toBe(5);
    });

    it('income-by-payment-method: Kas Laci 138000.00, QRIS 95000.00 (Bank BCA absent — it had zero INFLOW)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/income-by-payment-method?${range}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as IncomeByPaymentMethodResponse;
      // The query INNER JOINs accounts to INFLOW-only ledger entries
      // (reports.service.ts incomeByPaymentMethod) — an account with no
      // inflow in range produces no row at all, not a zero row. Bank BCA
      // only ever received OUTFLOW entries this period, so it is absent.
      expect(body.rows).toHaveLength(2);
      const byAccount = new Map(body.rows.map((r) => [r.accountName, r.total]));
      expect(byAccount.get('Kas Laci')).toBe('138000.00');
      expect(byAccount.get('QRIS Merchant')).toBe('95000.00');
      expect(byAccount.has('Bank BCA')).toBe(false);
      expect(body.total).toBe('233000.00');
    });

    it('product-profit: Kopi Susu and Teh Manis totals', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/product-profit?${range}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as ProductProfitResponse;
      stage7ProductProfit = body;

      const byProduct = new Map(body.rows.map((r) => [r.productName, r]));
      const kopiSusuRow = byProduct.get('Kopi Susu')!;
      expect(kopiSusuRow.quantitySold).toBe('7.0000');
      expect(kopiSusuRow.revenue).toBe('163000.00');
      expect(kopiSusuRow.cogs).toBe('38552.50'); // 7 * 5507.50
      expect(kopiSusuRow.grossProfit).toBe('124447.50');

      const tehManisRow = byProduct.get('Teh Manis')!;
      expect(tehManisRow.quantitySold).toBe('7.0000');
      expect(tehManisRow.revenue).toBe('70000.00');
      expect(tehManisRow.cogs).toBe('2712.50'); // 7 * 387.50
      expect(tehManisRow.grossProfit).toBe('67287.50');
    });

    it('top-products by quantity: a genuine 7-vs-7 tie resolves Kopi Susu, then Teh Manis (name ASC)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/top-products?rankBy=quantity&${range}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as TopProductsResponse;
      expect(body.rows.map((r) => r.productName)).toEqual([
        'Kopi Susu',
        'Teh Manis',
      ]);
      expect(body.rows.map((r) => r.rank)).toEqual([1, 2]);
    });

    it('daily-income: 31 buckets, zero-filled, four non-zero days summing to totalIncome', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/daily-income?${range}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as DailyIncomeResponse;
      expect(body.rows).toHaveLength(31);

      const byDate = new Map(body.rows.map((r) => [r.date, r.income]));
      expect(byDate.get('2026-07-01')).toBe('80000.00');
      expect(byDate.get('2026-07-15')).toBe('45000.00');
      expect(byDate.get('2026-07-20')).toBe('88000.00');
      expect(byDate.get('2026-07-31')).toBe('20000.00');

      const nonZeroDates = new Set([
        '2026-07-01',
        '2026-07-15',
        '2026-07-20',
        '2026-07-31',
      ]);
      for (const row of body.rows) {
        if (!nonZeroDates.has(row.date)) {
          expect(row.income).toBe('0.00');
        }
      }
      expect(body.total).toBe('233000.00');
    });

    it('cross-report invariants hold', async () => {
      const [ibpm, daily, productProfit] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/reports/income-by-payment-method?${range}`)
          .set('Cookie', ownerCookies)
          .then((r) => r.body as IncomeByPaymentMethodResponse),
        request(app.getHttpServer())
          .get(`/api/v1/reports/daily-income?${range}`)
          .set('Cookie', ownerCookies)
          .then((r) => r.body as DailyIncomeResponse),
        request(app.getHttpServer())
          .get(`/api/v1/reports/product-profit?${range}`)
          .set('Cookie', ownerCookies)
          .then((r) => r.body as ProductProfitResponse),
      ]);

      expect(ibpm.total).toBe(stage7ProfitLoss.cash.totalInflow);
      expect(daily.total).toBe(stage7ProfitLoss.totalIncome);
      expect(productProfit.totals.revenue).toBe(stage7ProfitLoss.salesRevenue);
      expect(productProfit.totals.cogs).toBe(stage7ProfitLoss.cogs);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 8 — Inventory close (Gate 1 / ADR-023 numbers)
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 8 — inventory close', () => {
    it('July summary matches the post-Gate-1 (WIB) figures', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inventory/summary?period=2026-07')
        .set('Cookie', ownerCookies)
        .expect(200);

      const body = res.body as InventorySummaryResponse;
      const byMaterial = new Map(body.data.map((r) => [r.name, r]));

      const kopi = byMaterial.get('Kopi')!;
      expect(kopi.openingQuantity).toBe('5.0000');
      expect(kopi.inQuantity).toBe('3.0000');
      expect(kopi.outQuantity).toBe('0.1400');
      expect(kopi.closingQuantity).toBe('7.8600');

      const susu = byMaterial.get('Susu')!;
      expect(susu.openingQuantity).toBe('20.0000');
      expect(susu.inQuantity).toBe('10.0000');
      expect(susu.outQuantity).toBe('1.0500');
      expect(susu.closingQuantity).toBe('28.9500');

      const gula = byMaterial.get('Gula')!;
      expect(gula.openingQuantity).toBe('10.0000');
      expect(gula.inQuantity).toBe('10.0000');
      expect(gula.outQuantity).toBe('0.2800');
      expect(gula.closingQuantity).toBe('19.7200');
    });

    it('August summary matches the post-Gate-1 (WIB) figures, chained to July', async () => {
      const [julyRes, augustRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/v1/inventory/summary?period=2026-07')
          .set('Cookie', ownerCookies)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/v1/inventory/summary?period=2026-08')
          .set('Cookie', ownerCookies)
          .expect(200),
      ]);

      const july = new Map(
        (julyRes.body as InventorySummaryResponse).data.map((r) => [r.name, r]),
      );
      const august = new Map(
        (augustRes.body as InventorySummaryResponse).data.map((r) => [
          r.name,
          r,
        ]),
      );

      const expectedAugust: Record<
        string,
        { in: string; out: string; closing: string }
      > = {
        Kopi: { in: '0.0000', out: '0.0200', closing: '7.8400' },
        Susu: { in: '0.0000', out: '0.1500', closing: '28.8000' },
        Gula: { in: '0.0000', out: '0.0150', closing: '19.7050' },
      };

      for (const name of ['Kopi', 'Susu', 'Gula']) {
        const julyRow = july.get(name)!;
        const augustRow = august.get(name)!;
        const expected = expectedAugust[name];

        // Chained invariant 1: July's closing IS August's opening.
        expect(augustRow.openingQuantity).toBe(julyRow.closingQuantity);

        expect(augustRow.inQuantity).toBe(expected.in);
        expect(augustRow.outQuantity).toBe(expected.out);
        expect(augustRow.closingQuantity).toBe(expected.closing);

        // Chained invariant 2: August's closing IS the undated running
        // total on RawMaterial — because currentStock has no date, it can
        // only ever agree with the LAST period's closing balance.
        const material = await prisma.rawMaterial.findFirstOrThrow({
          where: { name },
        });
        expect(material.currentStock.toFixed(4)).toBe(
          augustRow.closingQuantity,
        );
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 9 — Historical immutability (ADR-005)
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 9 — historical immutability', () => {
    it("a live unitCost edit does not move July's already-reported figures", async () => {
      // Deliberately NOT counted in httpMutationCount — this is a master-data
      // edit probing immutability, not a cycle action (see Stage 10).
      await request(app.getHttpServer())
        .patch(`/api/v1/raw-materials/${kopiId}`)
        .set('Cookie', ownerCookies)
        .send({ unitCost: '200000.00' })
        .expect(200);

      const range = 'startDate=2026-07-01&endDate=2026-07-31';
      const [plRes, ppRes] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/reports/profit-loss?${range}`)
          .set('Cookie', ownerCookies)
          .expect(200),
        request(app.getHttpServer())
          .get(`/api/v1/reports/product-profit?${range}`)
          .set('Cookie', ownerCookies)
          .expect(200),
      ]);

      expect(plRes.body).toEqual(stage7ProfitLoss);
      expect(ppRes.body).toEqual(stage7ProductProfit);

      // But the LIVE HPP has moved: 0.02*200000 + 0.15*18500 + 0.015*15500 = 7007.50
      const productRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${kopiSusuId}`)
        .set('Cookie', ownerCookies)
        .expect(200);
      const product = productRes.body as ProductWithHppResponse;
      expect(product.hpp).toBe('7007.50');

      const material = (
        await request(app.getHttpServer())
          .get(`/api/v1/raw-materials/${kopiId}`)
          .set('Cookie', ownerCookies)
          .expect(200)
      ).body as RawMaterialResponse;
      // 6dp on the wire since ADR-024 — a per-unit cost is a rate, not an amount.
      expect(material.unitCost).toBe('200000.000000');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stage 10 — "No manual correction" attestation
  // ──────────────────────────────────────────────────────────────────────
  describe('Stage 10 — no manual correction attestation', () => {
    it('completed the cycle with every mutation routed through HTTP', () => {
      // 1 (opening stock) + 3 (purchases) + 2 (expenses) + 6 (sales)
      // + 2 (settlements T1, T2) + 2 (CSV import x2) + 4 (allocations) = 20.
      //
      // This is a cheap tripwire, not a proof: its only job is to fail loudly
      // the first time someone "fixes" a stage with a Prisma call instead of
      // an HTTP request. Failed probes (T3's 409, the 5th allocation's 400)
      // and Stage 9's master-data edit are intentionally excluded — they are
      // not cycle actions PRD §9 is describing.
      const EXPECTED_HTTP_MUTATIONS = 20;
      expect(httpMutationCount).toBe(EXPECTED_HTTP_MUTATIONS);
    });
  });
});
