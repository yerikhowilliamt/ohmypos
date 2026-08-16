// e2e tests run against the compose Postgres (host port 5433). Loading .env here
// keeps the connection string in one place rather than duplicated per suite.
import 'dotenv/config';
/**
 * OhMyPos — Reports E2E Tests, Dashboard 3 (PRD §5.4, ADR-005, ADR-006,
 * ADR-008, ADR-011, ADR-014, ADR-017, ADR-018, Playbook §10).
 *
 * Auth-aware end-to-end suite covering:
 * - a date range spanning a PARTIAL month, and the three boundary instants
 * - branch filter correctness, including ADR-014's central-branch attribution
 * - a payable SETTLED MID-PERIOD: cash moves, netProfit does not (ADR-006/017)
 * - the ADR-005 snapshot: a later unitCost change must not move a past report
 * - WIB day bucketing (ADR-018) — the case that fails under UTC bucketing
 * - cross-report invariants, RBAC, validation, and JSON serialization traps
 *
 * ISOLATION: reports aggregate globally, so every assertion is branch-filtered
 * onto this suite's own branches and historical windows (plan §8.1).
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  DailyIncomeResponse,
  DailyIncomeResponseSchema,
  IncomeByPaymentMethodResponse,
  IncomeByPaymentMethodResponseSchema,
  ProductProfitResponse,
  ProductProfitResponseSchema,
  ProfitLossResponse,
  ProfitLossResponseSchema,
  TopProductsResponse,
  TopProductsResponseSchema,
} from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Reports — Dashboard 3 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPassword123!';
  const owner = { email: 'rp-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'rp-admin@test.local', cookies: [] as string[] };
  const kasir = { email: 'rp-kasir@test.local', cookies: [] as string[] };

  let branchAId: string; // main figures
  let branchBId: string; // second branch, for the branch filter
  let branchCId: string; // range boundaries only
  let branchDId: string; // WIB bucketing only
  let branchEId: string; // ADR-005 immutability only
  let centralBranchId: string;

  let cashAccountId: string;
  let bankAccountId: string;

  let mKopiId: string;
  let mGulaId: string;
  let mSnackId: string;
  let mImmutId: string;

  let pKopiId: string;
  let pTehId: string;
  let pSnackId: string;
  let pImmutId: string;

  let supplierId: string;

  // ── Setup ─────────────────────────────────────────────────────────────────
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

    // ADR-014: resolved by name inside the purchase flow, so it must exist.
    const central = await prisma.branch.upsert({
      where: { name: 'Pusat (Dapur Sentral)' },
      update: {},
      create: { name: 'Pusat (Dapur Sentral)', address: 'Dapur Sentral' },
    });
    centralBranchId = central.id;

    branchAId = (await prisma.branch.create({ data: { name: 'RP Branch A' } }))
      .id;
    branchBId = (await prisma.branch.create({ data: { name: 'RP Branch B' } }))
      .id;
    branchCId = (await prisma.branch.create({ data: { name: 'RP Branch C' } }))
      .id;
    branchDId = (await prisma.branch.create({ data: { name: 'RP Branch D' } }))
      .id;
    branchEId = (await prisma.branch.create({ data: { name: 'RP Branch E' } }))
      .id;

    cashAccountId = (
      await prisma.account.create({
        data: { name: 'RP Cash', type: 'CASH', openingBalance: '0' },
      })
    ).id;
    bankAccountId = (
      await prisma.account.create({
        data: { name: 'RP Bank', type: 'BANK', openingBalance: '0' },
      })
    ).id;

    // Required by ADR-012 — a system-generated entry cannot be uncategorised.
    for (const category of [
      { name: 'Penjualan', type: 'INFLOW' as const },
      { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' as const },
      { name: 'Operasional', type: 'OUTFLOW' as const },
    ]) {
      await prisma.category.upsert({
        where: { name: category.name },
        update: {},
        create: category,
      });
    }

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({
      data: [
        { name: 'RP Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'RP Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'RP Kasir',
          email: kasir.email,
          passwordHash,
          role: 'KASIR',
          branchId: branchAId,
        },
      ],
    });

    owner.cookies = await login(owner.email);
    admin.cookies = await login(admin.email);
    kasir.cookies = await login(kasir.email);

    mKopiId = (await createMaterial('RP M-Kopi', 'kg', '10000.00')).id;
    mGulaId = (await createMaterial('RP M-Gula', 'kg', '5000.00')).id;
    mSnackId = (await createMaterial('RP M-Snack', 'pcs', '2000.00')).id;
    mImmutId = (await createMaterial('RP M-Immut', 'pcs', '3000.00')).id;

    pKopiId = (await createProduct('RP P-Kopi', '20000.00')).id;
    pTehId = (await createProduct('RP P-Teh', '10000.00')).id;
    pSnackId = (await createProduct('RP P-Snack', '5000.00')).id;
    pImmutId = (await createProduct('RP P-Immut', '10000.00')).id;

    await createRecipeItem(pKopiId, mKopiId, '0.5000'); // hpp 5000.00
    await createRecipeItem(pTehId, mGulaId, '0.4000'); // hpp 2000.00
    await createRecipeItem(pSnackId, mSnackId, '1.0000'); // hpp 2000.00
    await createRecipeItem(pImmutId, mImmutId, '1.0000'); // hpp 3000.00

    supplierId = (
      await prisma.supplier.create({ data: { name: 'RP Supplier' } })
    ).id;

    // ── Sales, branch A (plan §8.2) ─────────────────────────────────────────
    await postSale(branchAId, cashAccountId, '2025-03-05T10:00:00+07:00', [
      { productId: pKopiId, quantity: '2.0000' },
    ]);
    await postSale(branchAId, bankAccountId, '2025-03-15T10:00:00+07:00', [
      { productId: pKopiId, quantity: '1.0000' },
      { productId: pTehId, quantity: '3.0000' },
    ]);
    await postSale(branchAId, cashAccountId, '2025-03-20T10:00:00+07:00', [
      { productId: pSnackId, quantity: '1.0000' },
    ]);

    // ── Sales, branch B ─────────────────────────────────────────────────────
    await postSale(branchBId, cashAccountId, '2025-03-15T10:00:00+07:00', [
      { productId: pTehId, quantity: '4.0000' },
    ]);

    // ── Branch C: the four boundary instants around 2025-04-10 … 2025-04-18 ──
    await postSale(branchCId, cashAccountId, '2025-04-10T00:00:00+07:00', [
      { productId: pSnackId, quantity: '1.0000' }, // INSIDE  (first instant of start day)
    ]);
    await postSale(branchCId, cashAccountId, '2025-04-18T23:59:59+07:00', [
      { productId: pSnackId, quantity: '1.0000' }, // INSIDE  (last instant of end day)
    ]);
    await postSale(branchCId, cashAccountId, '2025-04-19T00:00:00+07:00', [
      { productId: pSnackId, quantity: '1.0000' }, // OUTSIDE (first instant of next day)
    ]);
    await postSale(branchCId, cashAccountId, '2025-04-09T23:59:59+07:00', [
      { productId: pSnackId, quantity: '1.0000' }, // OUTSIDE (last instant of prior day)
    ]);

    // ── Branch D: WIB bucketing. 23:30 WIB = 16:30Z same day;
    //    00:30 WIB next day = 17:30Z the SAME UTC day. Under UTC bucketing both
    //    land on 05-10, which is what makes this the ADR-018 test.
    await postSale(branchDId, cashAccountId, '2025-05-10T23:30:00+07:00', [
      { productId: pSnackId, quantity: '1.0000' },
    ]);
    await postSale(branchDId, cashAccountId, '2025-05-11T00:30:00+07:00', [
      { productId: pSnackId, quantity: '1.0000' },
    ]);

    // ── Branch E: isolated fixture for the ADR-005 immutability case ─────────
    await postSale(branchEId, cashAccountId, '2025-06-10T10:00:00+07:00', [
      { productId: pImmutId, quantity: '2.0000' },
    ]);

    // ── Manual ledger entries, branch A ─────────────────────────────────────
    await postLedgerEntry({
      branchId: branchAId,
      accountId: cashAccountId,
      categoryName: 'Operasional',
      entryDate: '2025-03-10T10:00:00+07:00',
      amount: '15000.00',
      type: 'OUTFLOW',
    });
    await postLedgerEntry({
      branchId: branchAId,
      accountId: bankAccountId,
      categoryName: 'Penjualan',
      entryDate: '2025-03-11T10:00:00+07:00',
      amount: '7000.00',
      type: 'INFLOW',
    });

    // ── Central PAID purchase: its ledger entry lands on Pusat (ADR-014) ─────
    await postPurchase({
      branchId: null,
      paymentStatus: 'PAID',
      accountId: cashAccountId,
      purchaseDate: '2025-03-08T10:00:00+07:00',
      rawMaterialId: mKopiId,
      quantity: '1.0000',
      unitCost: '30000.00',
    });

    // ── Branch A UNPAID purchase dated BEFORE the window, settled inside it ──
    // ADR-006: no LedgerEntry at purchase time. February must therefore show
    // zero outflow for it, and March must show only the settled portion.
    const unpaidPurchaseId = await postPurchase({
      branchId: branchAId,
      paymentStatus: 'UNPAID',
      accountId: undefined,
      purchaseDate: '2025-02-20T10:00:00+07:00',
      rawMaterialId: mSnackId,
      quantity: '1.0000',
      unitCost: '20000.00',
    });
    const payable = await prisma.payable.findFirstOrThrow({
      where: { supplierPurchaseId: unpaidPurchaseId },
    });
    await postSettlement(payable.id, '12000.00', '2025-03-12T10:00:00+07:00');
    await postSettlement(payable.id, '8000.00', '2025-04-05T10:00:00+07:00');
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  async function createMaterial(name: string, unit: string, unitCost: string) {
    return prisma.rawMaterial.create({
      data: {
        name,
        unit,
        unitCost,
        currentStock: '1000.0000',
        lowStockThreshold: '0',
      },
    });
  }

  async function createProduct(name: string, sellPrice: string) {
    return prisma.product.create({ data: { name, sellPrice, isActive: true } });
  }

  async function createRecipeItem(
    productId: string,
    rawMaterialId: string,
    quantityUsed: string,
  ) {
    return prisma.recipeItem.create({
      data: { productId, rawMaterialId, quantityUsed },
    });
  }

  /** Always as OWNER: unscoped by branch, so one helper covers all five branches. */
  async function postSale(
    branchId: string,
    accountId: string,
    soldAt: string,
    items: Array<{ productId: string; quantity: string }>,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Cookie', owner.cookies)
      .send({ branchId, accountId, soldAt, items })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  async function postLedgerEntry(input: {
    branchId: string;
    accountId: string;
    categoryName: string;
    entryDate: string;
    amount: string;
    type: 'INFLOW' | 'OUTFLOW';
  }): Promise<void> {
    const category = await prisma.category.findUniqueOrThrow({
      where: { name: input.categoryName },
    });
    await request(app.getHttpServer())
      .post('/api/v1/ledger-entries')
      .set('Cookie', owner.cookies)
      .send({
        accountId: input.accountId,
        categoryId: category.id,
        branchId: input.branchId,
        entryDate: input.entryDate,
        amount: input.amount,
        type: input.type,
      })
      .expect(201);
  }

  async function postPurchase(input: {
    branchId: string | null;
    paymentStatus: 'PAID' | 'UNPAID';
    accountId: string | undefined;
    purchaseDate: string;
    rawMaterialId: string;
    quantity: string;
    unitCost: string;
  }): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/supplier-purchases')
      .set('Cookie', owner.cookies)
      .send({
        supplierId,
        branchId: input.branchId,
        purchaseDate: input.purchaseDate,
        paymentStatus: input.paymentStatus,
        ...(input.accountId ? { accountId: input.accountId } : {}),
        items: [
          {
            rawMaterialId: input.rawMaterialId,
            quantity: input.quantity,
            unitCost: input.unitCost,
          },
        ],
      })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  async function postSettlement(
    payableId: string,
    amount: string,
    settledAt: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/payables/${payableId}/settlements`)
      .set('Cookie', owner.cookies)
      .send({ accountId: cashAccountId, amount, settledAt })
      .expect(201);
  }

  /** GET a report as OWNER unless other cookies are supplied. */
  function getReport(
    path: string,
    query: Record<string, string | number>,
    cookies: string[] = owner.cookies,
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/reports/${path}`)
      .set('Cookie', cookies)
      .query(query);
  }

  const march = { startDate: '2025-03-01', endDate: '2025-03-31' };

  /**
   * FK-safe deletion order. Sale/SaleItem before ledger_entries (Sale →
   * LedgerEntry is Restrict), settlements before payables, purchase items
   * before purchases, everything before the branches and accounts they point
   * at. This is the ERR-004 / ERR-005 / TASK-007 lesson applied ahead of time.
   */
  async function cleanup() {
    await prisma.saleItem.deleteMany({
      where: { sale: { branch: { name: { startsWith: 'RP ' } } } },
    });
    await prisma.sale.deleteMany({
      where: { branch: { name: { startsWith: 'RP ' } } },
    });
    await prisma.payableSettlement.deleteMany({
      where: { payable: { supplier: { name: { startsWith: 'RP ' } } } },
    });
    await prisma.payable.deleteMany({
      where: { supplier: { name: { startsWith: 'RP ' } } },
    });
    await prisma.supplierPurchaseItem.deleteMany({
      where: {
        supplierPurchase: { supplier: { name: { startsWith: 'RP ' } } },
      },
    });
    await prisma.supplierPurchase.deleteMany({
      where: { supplier: { name: { startsWith: 'RP ' } } },
    });
    await prisma.stockMovement.deleteMany({
      where: { rawMaterial: { name: { startsWith: 'RP ' } } },
    });
    // The central purchase's entry sits on Pusat, not on an RP branch — the
    // account clause is what catches it.
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { branch: { name: { startsWith: 'RP ' } } },
          { account: { name: { startsWith: 'RP ' } } },
        ],
      },
    });
    await prisma.recipeItem.deleteMany({
      where: { product: { name: { startsWith: 'RP ' } } },
    });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'RP ' } } });
    await prisma.rawMaterial.deleteMany({
      where: { name: { startsWith: 'RP ' } },
    });
    await prisma.supplier.deleteMany({
      where: { name: { startsWith: 'RP ' } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'rp-' } },
    });
    await prisma.branch.deleteMany({ where: { name: { startsWith: 'RP ' } } });
    await prisma.account.deleteMany({ where: { name: { startsWith: 'RP ' } } });
  }

  // ---------------------------------------------------------------------------
  // 1. P&L — the ADR-017 composition
  // ---------------------------------------------------------------------------
  describe('P&L (ADR-017)', () => {
    it('Case 1: reports the margin view and the cash view for a full month', async () => {
      const res = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      expect(body.salesRevenue).toBe('95000.00');
      expect(body.otherIncome).toBe('7000.00');
      expect(body.totalIncome).toBe('102000.00');
      expect(body.cogs).toBe('23000.00');
      expect(body.grossProfit).toBe('79000.00');
      expect(body.operatingExpenses).toBe('15000.00');
      expect(body.netProfit).toBe('64000.00');
      expect(body.netMarginPct).toBe(62.75);

      expect(body.cash.totalInflow).toBe('102000.00');
      expect(body.cash.totalOutflow).toBe('27000.00');
      expect(body.cash.materialCashOutflow).toBe('12000.00');
      expect(body.cash.netCashFlow).toBe('75000.00');

      expect(body.saleCount).toBe(3);
      expect(body.period.dayCount).toBe(31);
      expect(body.period.timezone).toBe('Asia/Jakarta');
      expect(body.period.branchName).toBe('RP Branch A');
    });

    it('Case 2: the response conforms to ProfitLossResponseSchema', async () => {
      const res = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      expect(() => ProfitLossResponseSchema.parse(res.body)).not.toThrow();
    });

    it('Case 3: counts are JSON numbers, not BigInt-derived strings', async () => {
      const res = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;
      expect(typeof body.saleCount).toBe('number');
    });

    it('Case 4: an empty window returns zeros and a null margin, not nulls or NaN', async () => {
      const res = await getReport('profit-loss', {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        branchId: branchAId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      expect(body.totalIncome).toBe('0.00');
      expect(body.cogs).toBe('0.00');
      expect(body.netProfit).toBe('0.00');
      expect(body.netMarginPct).toBeNull();
      expect(body.saleCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Date range — partial month and the boundary instants
  // ---------------------------------------------------------------------------
  describe('Date range', () => {
    it('Case 5: a partial month counts only what falls inside it', async () => {
      const res = await getReport('profit-loss', {
        startDate: '2025-03-10',
        endDate: '2025-03-18',
        branchId: branchAId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      // Only the 03-15 sale; the 03-05 and 03-20 sales are outside.
      expect(body.salesRevenue).toBe('50000.00');
      expect(body.cogs).toBe('11000.00');
      expect(body.saleCount).toBe(1);
      // The manual entries (03-10, 03-11) and the settlement (03-12) are inside.
      expect(body.otherIncome).toBe('7000.00');
      expect(body.operatingExpenses).toBe('15000.00');
      expect(body.cash.materialCashOutflow).toBe('12000.00');
      expect(body.period.dayCount).toBe(9);
    });

    it('Case 6: both endpoints are inclusive to the instant', async () => {
      const res = await getReport('profit-loss', {
        startDate: '2025-04-10',
        endDate: '2025-04-18',
        branchId: branchCId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      // 04-10T00:00 and 04-18T23:59:59 are IN; 04-09T23:59:59 and 04-19T00:00 are OUT.
      expect(body.salesRevenue).toBe('10000.00');
      expect(body.saleCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Branch filter, including ADR-014 central attribution
  // ---------------------------------------------------------------------------
  describe('Branch filter', () => {
    it('Case 7: each branch reports only its own revenue and COGS', async () => {
      const a = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const b = await getReport('profit-loss', {
        ...march,
        branchId: branchBId,
      }).expect(200);
      const aBody = a.body as ProfitLossResponse;
      const bBody = b.body as ProfitLossResponse;

      expect(aBody.salesRevenue).toBe('95000.00');
      expect(bBody.salesRevenue).toBe('40000.00');
      expect(bBody.cogs).toBe('8000.00');
      expect(bBody.operatingExpenses).toBe('0.00');
      expect(bBody.netProfit).toBe('32000.00');
      expect(bBody.saleCount).toBe(1);
    });

    it("Case 8: branch B's products do not appear in branch A's product report", async () => {
      const res = await getReport('product-profit', {
        ...march,
        branchId: branchBId,
      }).expect(200);
      const body = res.body as ProductProfitResponse;

      const ids = body.rows.map((r) => r.productId);
      expect(ids).toEqual([pTehId]);
    });

    it('Case 9 (ADR-014): a central purchase lands on Pusat, not on any outlet', async () => {
      const pusat = await getReport('profit-loss', {
        ...march,
        branchId: centralBranchId,
      }).expect(200);
      const pusatBody = pusat.body as ProfitLossResponse;

      // Outflow with no revenue is the correct picture of a central kitchen.
      expect(pusatBody.salesRevenue).toBe('0.00');
      expect(pusatBody.cogs).toBe('0.00');
      expect(pusatBody.cash.materialCashOutflow).toBe('30000.00');
      expect(pusatBody.cash.netCashFlow).toBe('-30000.00');
      expect(pusatBody.netMarginPct).toBeNull();

      // ...and it is absent from both outlets, which still report full COGS.
      const a = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const aBody = a.body as ProfitLossResponse;
      expect(aBody.cash.materialCashOutflow).toBe('12000.00');
      expect(aBody.cogs).toBe('23000.00');
    });

    it('Case 10: an unknown branch id returns zeros with a 200, not a 404', async () => {
      const res = await getReport('profit-loss', {
        ...march,
        branchId: '11111111-1111-4111-8111-111111111111',
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      expect(body.totalIncome).toBe('0.00');
      expect(body.period.branchName).toBeNull();
    });

    it('Case 11: unfiltered totals are at least the sum of the filtered branches', async () => {
      const all = await getReport('profit-loss', march).expect(200);
      const allBody = all.body as ProfitLossResponse;
      // ">=" not "==": the seed and other suites also write into this window's
      // table. Absolute equality here would be a flake, not a stronger test.
      expect(Number(allBody.totalIncome)).toBeGreaterThanOrEqual(142000);
      expect(allBody.period.branchId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Payable settled mid-period (ADR-006 × ADR-017)
  // ---------------------------------------------------------------------------
  describe('Payable settled mid-period', () => {
    it('Case 12: an UNPAID purchase creates no expense in its own month', async () => {
      const res = await getReport('profit-loss', {
        startDate: '2025-02-01',
        endDate: '2025-02-28',
        branchId: branchAId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      // The goods arrived on 2025-02-20 but no money moved (ADR-006).
      expect(body.cash.materialCashOutflow).toBe('0.00');
      expect(body.cash.totalOutflow).toBe('0.00');
      expect(body.totalIncome).toBe('0.00');
    });

    it('Case 13: the settlement moves cash in the month it lands, partially', async () => {
      const marchRes = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const aprilRes = await getReport('profit-loss', {
        startDate: '2025-04-01',
        endDate: '2025-04-30',
        branchId: branchAId,
      }).expect(200);
      const marchBody = marchRes.body as ProfitLossResponse;
      const aprilBody = aprilRes.body as ProfitLossResponse;

      expect(marchBody.cash.materialCashOutflow).toBe('12000.00');
      expect(aprilBody.cash.materialCashOutflow).toBe('8000.00');
      expect(aprilBody.cash.netCashFlow).toBe('-8000.00');
    });

    it('Case 14: the settlement changes neither COGS nor operating expenses nor netProfit', async () => {
      const res = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const body = res.body as ProfitLossResponse;

      // 15000 is the manual expense alone — the 12000 settlement is NOT in it.
      expect(body.operatingExpenses).toBe('15000.00');
      expect(body.cogs).toBe('23000.00');
      expect(body.netProfit).toBe('64000.00');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Product profit and top products
  // ---------------------------------------------------------------------------
  describe('Product profit & top products', () => {
    it('Case 15: per-product revenue, COGS and margin, ordered by revenue', async () => {
      const res = await getReport('product-profit', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      expect(() => ProductProfitResponseSchema.parse(res.body)).not.toThrow();
      const body = res.body as ProductProfitResponse;

      expect(body.rows).toHaveLength(3);
      expect(body.rows[0]).toMatchObject({
        productId: pKopiId,
        quantitySold: '3.0000',
        revenue: '60000.00',
        cogs: '15000.00',
        grossProfit: '45000.00',
        marginPct: 75,
        lineCount: 2,
      });
      expect(body.rows[1]).toMatchObject({
        productId: pTehId,
        revenue: '30000.00',
        cogs: '6000.00',
        marginPct: 80,
      });
      expect(body.rows[2]).toMatchObject({
        productId: pSnackId,
        revenue: '5000.00',
        cogs: '2000.00',
        marginPct: 60,
      });

      expect(body.totals).toEqual({
        revenue: '95000.00',
        cogs: '23000.00',
        grossProfit: '72000.00',
      });
    });

    it('Case 16: top-products ranks by quantity by default, tie-broken by name', async () => {
      const res = await getReport('top-products', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      expect(() => TopProductsResponseSchema.parse(res.body)).not.toThrow();
      const body = res.body as TopProductsResponse;

      // P-Kopi and P-Teh both sold 3 units — the tie-break is name ASC.
      expect(body.rankBy).toBe('quantity');
      expect(body.rows.map((r) => r.productId)).toEqual([
        pKopiId,
        pTehId,
        pSnackId,
      ]);
      expect(body.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    });

    it('Case 17: rankBy=profit reorders and limit truncates', async () => {
      const byProfit = await getReport('top-products', {
        ...march,
        branchId: branchAId,
        rankBy: 'profit',
      }).expect(200);
      const byProfitBody = byProfit.body as TopProductsResponse;
      expect(byProfitBody.rows.map((r) => r.grossProfit)).toEqual([
        '45000.00',
        '24000.00',
        '3000.00',
      ]);

      const limited = await getReport('top-products', {
        ...march,
        branchId: branchAId,
        limit: 2,
      }).expect(200);
      const limitedBody = limited.body as TopProductsResponse;
      expect(limitedBody.rows).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. ADR-005 — the snapshot is why these reports can be trusted
  // ---------------------------------------------------------------------------
  describe('HPP snapshot immutability (ADR-005)', () => {
    it('Case 18: raising a raw material cost moves live Product HPP but NOT a past report', async () => {
      const june = {
        startDate: '2025-06-01',
        endDate: '2025-06-30',
        branchId: branchEId,
      };

      const before = await getReport('product-profit', june).expect(200);
      const beforeBody = before.body as ProductProfitResponse;
      expect(beforeBody.rows[0]).toMatchObject({
        productId: pImmutId,
        revenue: '20000.00',
        cogs: '6000.00', // 2 units × 3000.00 snapshot
      });

      const productBefore = await request(app.getHttpServer())
        .get(`/api/v1/products/${pImmutId}`)
        .set('Cookie', owner.cookies)
        .expect(200);
      expect((productBefore.body as { hpp: string }).hpp).toBe('3000.00');

      // Triple the material cost.
      await request(app.getHttpServer())
        .patch(`/api/v1/raw-materials/${mImmutId}`)
        .set('Cookie', owner.cookies)
        .send({ unitCost: '9000.00' })
        .expect(200);

      // The live figure MUST move — without this assertion the test could pass
      // by doing nothing at all.
      const productAfter = await request(app.getHttpServer())
        .get(`/api/v1/products/${pImmutId}`)
        .set('Cookie', owner.cookies)
        .expect(200);
      expect((productAfter.body as { hpp: string }).hpp).toBe('9000.00');

      // The report MUST NOT move (ADR-005; AGENTS.md Troubleshooting).
      const after = await getReport('product-profit', june).expect(200);
      const afterBody = after.body as ProductProfitResponse;
      expect(afterBody.rows[0].cogs).toBe('6000.00');
      expect(afterBody.rows[0].grossProfit).toBe('14000.00');

      const pl = await getReport('profit-loss', june).expect(200);
      const plBody = pl.body as ProfitLossResponse;
      expect(plBody.cogs).toBe('6000.00');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Income by payment method & daily income
  // ---------------------------------------------------------------------------
  describe('Income by payment method', () => {
    it('Case 19: splits by account and by sales-vs-other, ordered by total', async () => {
      const res = await getReport('income-by-payment-method', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      expect(() =>
        IncomeByPaymentMethodResponseSchema.parse(res.body),
      ).not.toThrow();
      const body = res.body as IncomeByPaymentMethodResponse;

      expect(body.rows).toHaveLength(2);
      expect(body.rows[0]).toMatchObject({
        accountId: bankAccountId,
        accountType: 'BANK',
        total: '57000.00',
        salesTotal: '50000.00',
        otherTotal: '7000.00',
        sharePct: 55.88,
      });
      expect(body.rows[1]).toMatchObject({
        accountId: cashAccountId,
        accountType: 'CASH',
        total: '45000.00',
        otherTotal: '0.00',
        sharePct: 44.12,
      });
      expect(body.total).toBe('102000.00');
    });
  });

  describe('Daily income (ADR-018)', () => {
    it('Case 20: one row per day, zero-filled, with the range average', async () => {
      const res = await getReport('daily-income', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      expect(() => DailyIncomeResponseSchema.parse(res.body)).not.toThrow();
      const body = res.body as DailyIncomeResponse;

      expect(body.rows).toHaveLength(31);
      expect(body.rows[0].date).toBe('2025-03-01');
      expect(body.rows[30].date).toBe('2025-03-31');

      const byDate = new Map<string, string>(
        body.rows.map((r) => [r.date, r.income]),
      );
      expect(byDate.get('2025-03-05')).toBe('40000.00');
      expect(byDate.get('2025-03-11')).toBe('7000.00');
      expect(byDate.get('2025-03-15')).toBe('50000.00');
      expect(byDate.get('2025-03-20')).toBe('5000.00');
      expect(byDate.get('2025-03-06')).toBe('0.00');

      expect(body.total).toBe('102000.00');
      // 102000 / 31 days in range — NOT / 4 days that had income.
      expect(body.averagePerDay).toBe('3290.32');
    });

    it('Case 21: buckets by the WIB day, not the UTC day', async () => {
      const res = await getReport('daily-income', {
        startDate: '2025-05-10',
        endDate: '2025-05-11',
        branchId: branchDId,
      }).expect(200);
      const body = res.body as DailyIncomeResponse;

      // 2025-05-10T23:30+07:00 = 16:30Z on 05-10  -> WIB day 05-10
      // 2025-05-11T00:30+07:00 = 17:30Z on 05-10  -> WIB day 05-11
      // Under UTC bucketing BOTH would land on 05-10 and this fails.
      expect(body.rows).toEqual([
        { date: '2025-05-10', income: '5000.00', entryCount: 1 },
        { date: '2025-05-11', income: '5000.00', entryCount: 1 },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Cross-report invariants
  // ---------------------------------------------------------------------------
  describe('Cross-report invariants', () => {
    it('Case 22: income-by-payment-method total equals the P&L total income', async () => {
      const pl = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const income = await getReport('income-by-payment-method', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const plBody = pl.body as ProfitLossResponse;
      const incomeBody = income.body as IncomeByPaymentMethodResponse;

      expect(incomeBody.total).toBe(plBody.totalIncome);
    });

    it('Case 23: product-profit revenue equals the P&L sales revenue, and daily income equals total income', async () => {
      const pl = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const products = await getReport('product-profit', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const daily = await getReport('daily-income', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const plBody = pl.body as ProfitLossResponse;
      const productsBody = products.body as ProductProfitResponse;
      const dailyBody = daily.body as DailyIncomeResponse;

      expect(productsBody.totals.revenue).toBe(plBody.salesRevenue);
      expect(productsBody.totals.cogs).toBe(plBody.cogs);
      expect(dailyBody.total).toBe(plBody.totalIncome);
    });

    it('Case 24: P&L sales revenue equals the sum of Sale.totalAmount in the window', async () => {
      const pl = await getReport('profit-loss', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const plBody = pl.body as ProfitLossResponse;

      const sum = await prisma.sale.aggregate({
        _sum: { totalAmount: true },
        where: {
          branchId: branchAId,
          soldAt: {
            gte: new Date('2025-03-01T00:00:00+07:00'),
            lt: new Date('2025-04-01T00:00:00+07:00'),
          },
        },
      });
      expect(sum._sum.totalAmount?.toFixed(2)).toBe(plBody.salesRevenue);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Access control (ADR-011, Playbook §8)
  // ---------------------------------------------------------------------------
  describe('RBAC', () => {
    const paths = [
      'profit-loss',
      'product-profit',
      'income-by-payment-method',
      'top-products',
      'daily-income',
    ];

    it.each(paths)('Case 25: KASIR is rejected from /reports/%s', async (p) => {
      await getReport(p, march, kasir.cookies).expect(403);
    });

    it.each(paths)('Case 26: ADMIN is rejected from /reports/%s', async (p) => {
      // System Design §5/§6.6 — ADMIN has no reporting screen in v1.
      await getReport(p, march, admin.cookies).expect(403);
    });

    it.each(paths)('Case 27: OWNER is allowed on /reports/%s', async (p) => {
      await getReport(p, march).expect(200);
    });

    it.each(paths)(
      'Case 28: an unauthenticated caller is rejected from /reports/%s',
      async (p) => {
        await request(app.getHttpServer())
          .get(`/api/v1/reports/${p}`)
          .query(march)
          .expect(401);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // 10. Validation
  // ---------------------------------------------------------------------------
  describe('Validation', () => {
    it('Case 29: rejects an endDate before the startDate', async () => {
      await getReport('profit-loss', {
        startDate: '2025-03-31',
        endDate: '2025-03-01',
      }).expect(400);
    });

    it('Case 30: rejects a range wider than 366 days', async () => {
      await getReport('profit-loss', {
        startDate: '2024-01-01',
        endDate: '2025-01-02',
      }).expect(400);
    });

    it('Case 31: rejects a malformed date', async () => {
      await getReport('profit-loss', {
        startDate: '2025-3-5',
        endDate: '2025-03-15',
      }).expect(400);
    });

    it('Case 32: rejects an out-of-bounds limit and an unknown rankBy', async () => {
      await getReport('top-products', { ...march, limit: 51 }).expect(400);
      await getReport('top-products', { ...march, rankBy: 'hpp' }).expect(400);
    });

    it('Case 33: applies the default limit of 10 and rankBy of quantity', async () => {
      const res = await getReport('top-products', {
        ...march,
        branchId: branchAId,
      }).expect(200);
      const body = res.body as TopProductsResponse;
      expect(body.rankBy).toBe('quantity');
      expect(body.rows.length).toBeLessThanOrEqual(10);
    });
  });
});
