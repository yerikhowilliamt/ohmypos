// e2e tests run against the compose Postgres (host port 5433). Loading .env here
// keeps the connection string in one place rather than duplicated per suite.
import 'dotenv/config';
/**
 * OhMyPos — Inventory E2E Tests (PRD §5.5, §5.6, ADR-004, ADR-007, ADR-008,
 * ADR-011, ADR-016, Playbook §10, Phase 6 plan §12.2).
 *
 * The headline case is R: a full month built THROUGH THE REAL ENDPOINTS, then
 * reconciled three ways — against the report's own identity, against an
 * independent raw-SQL sum of stock_movements, and against
 * RawMaterial.currentStock. The last of those makes this suite an audit of
 * Phase 4 and Phase 5, not merely a test of Phase 6.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  InventorySummaryResponse,
  OpeningStockWorksheetResponse,
  UpsertOpeningStockResponse,
} from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';

describe('Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPassword123!';
  const owner = { email: 'inv-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'inv-admin@test.local', cookies: [] as string[] };
  const kasir = { email: 'inv-kasir@test.local', cookies: [] as string[] };

  let branchId: string;
  let accountId: string;
  let supplierId: string;

  // Case R
  let mReconId: string;
  let pReconId: string;

  // Case N
  let mNoDeclId: string;
  let mEmptyId: string;

  // Case M
  let mMidId: string;

  // Case S
  let mStatusOutId: string;
  let mStatusLowId: string;
  let mStatusOkId: string;

  // Case D
  let mDeclFreshId: string;
  let mDeclMidId: string;
  let pDeclMidId: string;
  let mDeclFixId: string;

  // Case V
  let mNegId: string;
  let pNegId: string;
  let mAtom1Id: string;
  let mAtom2Id: string;

  // Case C
  let mConcAId: string;
  let mConcBId: string;

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

    await prisma.branch.upsert({
      where: { name: 'Umum' },
      update: {},
      create: { name: 'Umum', isSystem: true },
    });

    const branch = await prisma.branch.create({
      data: { name: 'INV Test Branch', address: 'Jl. Inventory Test No. 1' },
    });
    branchId = branch.id;

    const account = await prisma.account.create({
      data: { name: 'INV Test Account', type: 'CASH', openingBalance: '0' },
    });
    accountId = account.id;

    const supplier = await prisma.supplier.create({
      data: { name: 'INV Test Supplier', contact: '08123456789' },
    });
    supplierId = supplier.id;

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

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        { name: 'INV Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'INV Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'INV Kasir',
          email: kasir.email,
          passwordHash,
          role: 'KASIR',
          branchId,
        },
      ],
    });

    owner.cookies = await login(owner.email);
    admin.cookies = await login(admin.email);
    kasir.cookies = await login(kasir.email);

    // ── Fixture: Case R (Reconciliation) ──────────────────────────────────
    const mRecon = await createMaterial(
      'INV M-Recon',
      'kg',
      '10000.00',
      '5.0000',
    );
    mReconId = mRecon.id;
    const pRecon = await createProduct('INV P-Recon', '20000.00');
    pReconId = pRecon.id;
    await createRecipeItem(pReconId, mReconId, '0.5000');

    // ── Fixture: Case N (No Declaration) ──────────────────────────────────
    const mNoDecl = await createMaterial(
      'INV M-NoDecl',
      'kg',
      '10000.00',
      '0.0000',
    );
    mNoDeclId = mNoDecl.id;
    const mEmpty = await createMaterial(
      'INV M-Empty',
      'kg',
      '10000.00',
      '0.0000',
    );
    mEmptyId = mEmpty.id;

    // ── Fixture: Case M (Mid-period Material) ──────────────────────────────
    const mMid = await createMaterial('INV M-Mid', 'kg', '15000.00', '0.0000');
    mMidId = mMid.id;

    // ── Fixture: Case S (Status Boundaries) ────────────────────────────────
    const mStatusOut = await createMaterial(
      'INV M-Status-Out',
      'kg',
      '10000.00',
      '5.0000',
    );
    mStatusOutId = mStatusOut.id;
    const mStatusLow = await createMaterial(
      'INV M-Status-Low',
      'kg',
      '10000.00',
      '5.0000',
    );
    mStatusLowId = mStatusLow.id;
    const mStatusOk = await createMaterial(
      'INV M-Status-Ok',
      'kg',
      '10000.00',
      '5.0000',
    );
    mStatusOkId = mStatusOk.id;

    // ── Fixture: Case D (Declaration Semantics) ────────────────────────────
    const mDeclFresh = await createMaterial(
      'INV M-Decl-Fresh',
      'kg',
      '10000.00',
      '0.0000',
    );
    mDeclFreshId = mDeclFresh.id;

    const mDeclMid = await createMaterial(
      'INV M-Decl-Mid',
      'kg',
      '10000.00',
      '0.0000',
    );
    mDeclMidId = mDeclMid.id;
    const pDeclMid = await createProduct('INV P-Decl-Mid', '25000.00');
    pDeclMidId = pDeclMid.id;
    await createRecipeItem(pDeclMidId, mDeclMidId, '1.0000');

    const mDeclFix = await createMaterial(
      'INV M-Decl-Fix',
      'kg',
      '10000.00',
      '0.0000',
    );
    mDeclFixId = mDeclFix.id;

    // ── Fixture: Case V (Validation & Atomicity) ───────────────────────────
    const mNeg = await createMaterial('INV M-Neg', 'kg', '10000.00', '0.0000');
    mNegId = mNeg.id;
    const pNeg = await createProduct('INV P-Neg', '10000.00');
    pNegId = pNeg.id;
    await createRecipeItem(pNegId, mNegId, '1.0000');

    const mAtom1 = await createMaterial(
      'INV M-Atom-1',
      'kg',
      '10000.00',
      '0.0000',
    );
    mAtom1Id = mAtom1.id;
    const mAtom2 = await createMaterial(
      'INV M-Atom-2',
      'kg',
      '10000.00',
      '0.0000',
    );
    mAtom2Id = mAtom2.id;

    // ── Fixture: Case C (Concurrency) ─────────────────────────────────────
    const mConcA = await createMaterial(
      'INV M-Conc-A',
      'kg',
      '10000.00',
      '0.0000',
    );
    mConcAId = mConcA.id;
    const mConcB = await createMaterial(
      'INV M-Conc-B',
      'kg',
      '10000.00',
      '0.0000',
    );
    mConcBId = mConcB.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  async function createMaterial(
    name: string,
    unit: string,
    unitCost: string,
    lowStockThreshold: string,
  ) {
    return prisma.rawMaterial.create({
      data: {
        name,
        unit,
        purchaseUnit: unit,
        unitCost,
        currentStock: '0.0000',
        lowStockThreshold,
      },
    });
  }

  async function createProduct(name: string, sellPrice: string) {
    return prisma.product.create({
      data: { name, sellPrice, isActive: true },
    });
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

  /**
   * ADR-024: the API now takes the purchase quantity and the TOTAL price for
   * it. These fixtures all use materials with conversionFactor 1, so
   * `quantity` doubles as the purchase quantity and the derived per-unit cost
   * comes back out as `unitCost` — every downstream assertion is unchanged.
   */
  async function postPurchase(
    cookies: string[],
    rawMaterialId: string,
    quantity: string,
    unitCost: string,
    purchaseDate: string,
  ) {
    const lineTotal = new Prisma.Decimal(quantity).times(unitCost).toFixed(2);
    return request(app.getHttpServer())
      .post('/api/v1/supplier-purchases')
      .set('Cookie', cookies)
      .send({
        supplierId,
        branchId: null,
        purchaseDate,
        paymentStatus: 'PAID',
        accountId,
        items: [{ rawMaterialId, purchaseQuantity: quantity, lineTotal }],
      });
  }

  async function postSale(
    cookies: string[],
    productId: string,
    quantity: string,
    soldAt: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Cookie', cookies)
      .send({
        branchId,
        accountId,
        soldAt,
        items: [{ productId, quantity }],
      });
  }

  async function putOpeningStock(
    cookies: string[],
    periodMonth: string,
    entries: { rawMaterialId: string; quantity: string; unitPrice?: string }[],
  ) {
    return request(app.getHttpServer())
      .put('/api/v1/inventory/opening-stock')
      .set('Cookie', cookies)
      .send({ periodMonth, entries });
  }

  async function getSummary(cookies: string[], period: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/inventory/summary?period=${period}`)
      .set('Cookie', cookies);
  }

  async function getWorksheet(cookies: string[], period: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/inventory/opening-stock?period=${period}`)
      .set('Cookie', cookies);
  }

  /**
   * The INDEPENDENT oracle (plan §2.3). Deliberately raw SQL that shares no
   * code with the production aggregation — two implementations that must agree
   * is a stronger check than one implementation tested against itself.
   */
  async function signedMovementSum(
    rawMaterialId: string,
    beforeIso: string,
  ): Promise<Prisma.Decimal> {
    const rows = await prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
      SELECT SUM(CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END) AS total
      FROM stock_movements
      WHERE raw_material_id = ${rawMaterialId}
        AND movement_date < ${new Date(beforeIso)}
    `;
    return rows[0]?.total ?? new Prisma.Decimal(0);
  }

  function rowFor(
    body: InventorySummaryResponse,
    rawMaterialId: string,
  ): InventorySummaryResponse['data'][number] {
    const row = body.data.find((r) => r.rawMaterialId === rawMaterialId);
    expect(row).toBeDefined();
    return row!;
  }

  async function cleanup() {
    await prisma.openingStock.deleteMany({
      where: { rawMaterial: { name: { startsWith: 'INV ' } } },
    });
    await prisma.saleItem.deleteMany({
      where: { product: { name: { startsWith: 'INV ' } } },
    });
    await prisma.sale.deleteMany({
      where: { branch: { name: 'INV Test Branch' } },
    });
    await prisma.supplierPurchaseItem.deleteMany({
      where: { rawMaterial: { name: { startsWith: 'INV ' } } },
    });
    await prisma.supplierPurchase.deleteMany({
      where: { supplier: { name: 'INV Test Supplier' } },
    });
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { branch: { name: 'INV Test Branch' } },
          { account: { name: 'INV Test Account' } },
        ],
      },
    });
    await prisma.stockMovement.deleteMany({
      where: { rawMaterial: { name: { startsWith: 'INV ' } } },
    });
    await prisma.recipeItem.deleteMany({
      where: { product: { name: { startsWith: 'INV ' } } },
    });
    await prisma.product.deleteMany({
      where: { name: { startsWith: 'INV ' } },
    });
    await prisma.rawMaterial.deleteMany({
      where: { name: { startsWith: 'INV ' } },
    });
    await prisma.supplier.deleteMany({ where: { name: 'INV Test Supplier' } });
    await prisma.user.deleteMany({
      where: { email: { in: [owner.email, admin.email, kasir.email] } },
    });
    await prisma.branch.deleteMany({ where: { name: 'INV Test Branch' } });
    await prisma.account.deleteMany({ where: { name: 'INV Test Account' } });
  }

  // ── Case R: Reconciliation ────────────────────────────────────────────────
  describe('Case R — reconciliation', () => {
    beforeAll(async () => {
      // Step 1: Purchase 40.0000 kg on 2026-04-20
      await postPurchase(
        owner.cookies,
        mReconId,
        '40.0000',
        '10000.00',
        '2026-04-20T08:00:00.000Z',
      );

      // Step 2: Opening declaration 38.0000 for May (unitPrice required because no May purchase yet)
      const putRes = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mReconId, quantity: '38.0000', unitPrice: '10000.00' },
      ]);
      expect(putRes.status).toBe(200);

      // Steps 3-5: Purchases inside May
      await postPurchase(
        owner.cookies,
        mReconId,
        '10.0000',
        '10000.00',
        '2026-05-01T00:00:00.000Z',
      );
      await postPurchase(
        owner.cookies,
        mReconId,
        '25.0000',
        '10000.00',
        '2026-05-10T08:00:00.000Z',
      );
      await postPurchase(
        owner.cookies,
        mReconId,
        '5.0000',
        '10000.00',
        '2026-05-20T08:00:00.000Z',
      );

      // Steps 6-9: Sales inside May (each consumes 0.5kg per product unit)
      await postSale(
        owner.cookies,
        pReconId,
        '4.0000',
        '2026-05-05T03:00:00.000Z',
      ); // 2.0000 kg
      await postSale(
        owner.cookies,
        pReconId,
        '10.0000',
        '2026-05-15T03:00:00.000Z',
      ); // 5.0000 kg
      await postSale(
        owner.cookies,
        pReconId,
        '6.0000',
        '2026-05-25T03:00:00.000Z',
      ); // 3.0000 kg
      await postSale(
        owner.cookies,
        pReconId,
        '2.0000',
        '2026-05-31T23:59:59.999Z',
      ); // 1.0000 kg

      // Step 10: Purchase 100.0000 kg on 2026-06-01 (periodEnd)
      await postPurchase(
        owner.cookies,
        mReconId,
        '100.0000',
        '10000.00',
        '2026-06-01T00:00:00.000Z',
      );
    });

    it('R-a: openingQuantity + inQuantity - outQuantity === closingQuantity for May row', async () => {
      const res = await getSummary(owner.cookies, '2026-05');
      expect(res.status).toBe(200);
      const row = rowFor(res.body as InventorySummaryResponse, mReconId);

      expect(row.openingQuantity).toBe('38.0000');
      expect(row.inQuantity).toBe('40.0000');
      // ADR-023: period boundaries are Asia/Jakarta. The 2026-05-31T23:59:59.999Z
      // sale is 2026-06-01T06:59:59.999+07:00 WIB — it lands in June, not May.
      expect(row.outQuantity).toBe('10.0000');
      expect(row.closingQuantity).toBe('68.0000');
      expect(row.status).toBe('OK');

      const opening = new Prisma.Decimal(row.openingQuantity);
      const inQty = new Prisma.Decimal(row.inQuantity);
      const outQty = new Prisma.Decimal(row.outQuantity);
      const closing = new Prisma.Decimal(row.closingQuantity);
      expect(closing.toFixed(4)).toBe(
        opening.plus(inQty).minus(outQty).toFixed(4),
      );
    });

    it('R-b: closing equals an independent raw-SQL sum of every movement before periodEnd', async () => {
      const summary = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(summary.body as InventorySummaryResponse, mReconId);

      // ADR-023: May's periodEnd is WIB midnight of June 1st, i.e.
      // 2026-05-31T17:00:00.000Z in UTC — not the UTC calendar boundary.
      const oracle = await signedMovementSum(
        mReconId,
        '2026-05-31T17:00:00.000Z',
      );
      expect(row.closingQuantity).toBe('68.0000');
      expect(row.closingQuantity).toBe(oracle.toFixed(4));
    });

    it('R-c: openingQuantity equals the raw-SQL carry-forward plus in-period OPENING movements', async () => {
      const summary = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(summary.body as InventorySummaryResponse, mReconId);

      const carryForwardOracle = await signedMovementSum(
        mReconId,
        '2026-05-01T00:00:00.000Z',
      );
      const openingMovements = await prisma.stockMovement.findMany({
        where: {
          rawMaterialId: mReconId,
          referenceType: 'OPENING',
          movementDate: {
            gte: new Date('2026-05-01T00:00:00.000Z'),
            lt: new Date('2026-06-01T00:00:00.000Z'),
          },
        },
      });

      const openingDelta = openingMovements.reduce(
        (acc, m) =>
          m.direction === 'IN' ? acc.plus(m.quantity) : acc.minus(m.quantity),
        new Prisma.Decimal(0),
      );

      expect(row.openingQuantity).toBe(
        carryForwardOracle.plus(openingDelta).toFixed(4),
      );
    });

    it('R-d: June row closingQuantity (167.0000) equals RawMaterial.currentStock', async () => {
      const summary = await getSummary(owner.cookies, '2026-06');
      const row = rowFor(summary.body as InventorySummaryResponse, mReconId);
      expect(row.closingQuantity).toBe('167.0000');

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mReconId },
      });
      expect(row.closingQuantity).toBe(material.currentStock.toFixed(4));
    });

    it('R-e: boundary inclusivity (periodStart is in, periodEnd is not, April is in opening)', async () => {
      const summaryMay = await getSummary(owner.cookies, '2026-05');
      const rowMay = rowFor(
        summaryMay.body as InventorySummaryResponse,
        mReconId,
      );
      expect(rowMay.inQuantity).toBe('40.0000'); // 10 (at 00:00:00) + 25 + 5

      const summaryJune = await getSummary(owner.cookies, '2026-06');
      const rowJune = rowFor(
        summaryJune.body as InventorySummaryResponse,
        mReconId,
      );
      // 68.0000, not 67.0000 (ADR-023): the 2026-05-31T23:59:59.999Z sale is
      // WIB June 1st and so is June's opening carry-forward, not May's out.
      expect(rowJune.openingQuantity).toBe('68.0000');
      expect(rowJune.inQuantity).toBe('100.0000'); // June 1st purchase counted in June
    });

    it('R-f: chaining (April closing != May opening because of declaration, May closing == June opening with no declaration)', async () => {
      const apr = await getSummary(owner.cookies, '2026-04');
      const may = await getSummary(owner.cookies, '2026-05');
      const jun = await getSummary(owner.cookies, '2026-06');

      const rowApr = rowFor(apr.body as InventorySummaryResponse, mReconId);
      const rowMay = rowFor(may.body as InventorySummaryResponse, mReconId);
      const rowJun = rowFor(jun.body as InventorySummaryResponse, mReconId);

      expect(rowApr.closingQuantity).toBe('40.0000');
      expect(rowMay.openingQuantity).toBe('38.0000');
      expect(rowApr.closingQuantity).not.toBe(rowMay.openingQuantity); // Corrected by stock-take

      expect(rowMay.closingQuantity).toBe('68.0000');
      expect(rowJun.openingQuantity).toBe('68.0000');
      expect(rowMay.closingQuantity).toBe(rowJun.openingQuantity); // Chained without declaration
    });
  });

  // ── Case N: No Declaration ────────────────────────────────────────────────
  describe('Case N — no declaration', () => {
    it('N-1: INV M-NoDecl (purchased in April) carries balance into May without declaration', async () => {
      await postPurchase(
        owner.cookies,
        mNoDeclId,
        '12.0000',
        '10000.00',
        '2026-04-10T10:00:00.000Z',
      );

      const res = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(res.body as InventorySummaryResponse, mNoDeclId);

      expect(row.openingQuantity).toBe('12.0000');
      expect(row.inQuantity).toBe('0.0000');
      expect(row.outQuantity).toBe('0.0000');
      expect(row.closingQuantity).toBe('12.0000');
    });

    it('N-2: INV M-Empty (no movements ever) reports all 0.0000 and status OUT', async () => {
      const res = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(res.body as InventorySummaryResponse, mEmptyId);

      expect(row.openingQuantity).toBe('0.0000');
      expect(row.inQuantity).toBe('0.0000');
      expect(row.outQuantity).toBe('0.0000');
      expect(row.closingQuantity).toBe('0.0000');
      expect(row.status).toBe('OUT');
    });
  });

  // ── Case M: Mid-period Material ───────────────────────────────────────────
  describe('Case M — material added mid-period', () => {
    it('M-1: INV M-Mid first purchased mid-period reports opening 0.0000 and in/closing matching purchase', async () => {
      await postPurchase(
        owner.cookies,
        mMidId,
        '7.5000',
        '15000.00',
        '2026-05-12T10:00:00.000Z',
      );

      const res = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(res.body as InventorySummaryResponse, mMidId);

      expect(row.openingQuantity).toBe('0.0000');
      expect(row.inQuantity).toBe('7.5000');
      expect(row.outQuantity).toBe('0.0000');
      expect(row.closingQuantity).toBe('7.5000');
    });

    it('M-2: worksheet for INV M-Mid shows requiresUnitPrice: false because purchase exists', async () => {
      const res = await getWorksheet(owner.cookies, '2026-05');
      expect(res.status).toBe(200);
      const data = (res.body as OpeningStockWorksheetResponse).data;
      const row = data.find((r) => r.rawMaterialId === mMidId);

      expect(row).toBeDefined();
      expect(row!.declaredQuantity).toBeNull();
      expect(row!.carryForwardQuantity).toBe('0.0000');
      expect(row!.requiresUnitPrice).toBe(false);
    });
  });

  // ── Case S: Status Boundaries ─────────────────────────────────────────────
  describe('Case S — status boundaries', () => {
    it('S-1: status badge resolves OUT (0), LOW (at threshold), OK (> threshold)', async () => {
      // Threshold for all three is 5.0000
      await putOpeningStock(owner.cookies, '2026-05', [
        {
          rawMaterialId: mStatusOutId,
          quantity: '0.0000',
          unitPrice: '10000.00',
        },
        {
          rawMaterialId: mStatusLowId,
          quantity: '5.0000',
          unitPrice: '10000.00',
        },
        {
          rawMaterialId: mStatusOkId,
          quantity: '5.0001',
          unitPrice: '10000.00',
        },
      ]);

      const res = await getSummary(owner.cookies, '2026-05');
      const rowOut = rowFor(res.body as InventorySummaryResponse, mStatusOutId);
      const rowLow = rowFor(res.body as InventorySummaryResponse, mStatusLowId);
      const rowOk = rowFor(res.body as InventorySummaryResponse, mStatusOkId);

      expect(rowOut.status).toBe('OUT');
      expect(rowLow.status).toBe('LOW');
      expect(rowOk.status).toBe('OK');
    });
  });

  // ── Case D: Declaration Semantics ─────────────────────────────────────────
  describe('Case D — declaration semantics', () => {
    it('D-1: declaration on fresh material creates exact IN movement and updates currentStock', async () => {
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        {
          rawMaterialId: mDeclFreshId,
          quantity: '50.0000',
          unitPrice: '10000.00',
        },
      ]);
      expect(res.status).toBe(200);
      const body = res.body as UpsertOpeningStockResponse;
      expect(body.data[0].appliedDelta).toBe('50.0000');

      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: mDeclFreshId },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].direction).toBe('IN');
      expect(movements[0].quantity.toFixed(4)).toBe('50.0000');
      expect(movements[0].branchId).toBeNull();
      // ADR-023: the OPENING movement is dated at the period's WIB start
      // (May 1st 00:00 WIB = 2026-04-30T17:00:00.000Z in UTC), not UTC midnight.
      expect(movements[0].movementDate.toISOString()).toBe(
        '2026-04-30T17:00:00.000Z',
      );
      expect(movements[0].referenceId).toBe(body.data[0].id);

      const mat = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mDeclFreshId },
      });
      expect(mat.currentStock.toFixed(4)).toBe('50.0000');
    });

    it('D-2 (trap 1): mid-period declaration measures against carry-forward, not currentStock', async () => {
      // Purchase 100 on April 15th
      await postPurchase(
        owner.cookies,
        mDeclMidId,
        '100.0000',
        '10000.00',
        '2026-04-15T10:00:00.000Z',
      );
      // Sale consuming 20 on May 5th (currentStock 80.0000)
      await postSale(
        owner.cookies,
        pDeclMidId,
        '20.0000',
        '2026-05-05T10:00:00.000Z',
      );

      // Declare May opened at 90.0000 (delta should be -10.0000)
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        {
          rawMaterialId: mDeclMidId,
          quantity: '90.0000',
          unitPrice: '10000.00',
        },
      ]);
      expect(res.status).toBe(200);
      const body = res.body as UpsertOpeningStockResponse;
      expect(body.data[0].appliedDelta).toBe('-10.0000');

      const mat = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mDeclMidId },
      });
      expect(mat.currentStock.toFixed(4)).toBe('70.0000');

      const summary = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(summary.body as InventorySummaryResponse, mDeclMidId);
      expect(row.openingQuantity).toBe('90.0000');
      expect(row.outQuantity).toBe('20.0000');
      expect(row.closingQuantity).toBe('70.0000');
    });

    it('D-3 (trap 2): correcting declaration appends compensating movement and updates currentStock', async () => {
      // First declaration: 30.0000
      const res1 = await putOpeningStock(owner.cookies, '2026-05', [
        {
          rawMaterialId: mDeclFixId,
          quantity: '30.0000',
          unitPrice: '10000.00',
        },
      ]);
      expect(res1.status).toBe(200);

      // Second declaration: 35.0000 (should produce +5.0000 movement)
      const res2 = await putOpeningStock(owner.cookies, '2026-05', [
        {
          rawMaterialId: mDeclFixId,
          quantity: '35.0000',
          unitPrice: '10000.00',
        },
      ]);
      expect(res2.status).toBe(200);
      const body2 = res2.body as UpsertOpeningStockResponse;
      expect(body2.data[0].appliedDelta).toBe('5.0000');

      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: mDeclFixId, referenceType: 'OPENING' },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements).toHaveLength(2);
      expect(movements[0].quantity.toFixed(4)).toBe('30.0000');
      expect(movements[0].direction).toBe('IN');
      expect(movements[1].quantity.toFixed(4)).toBe('5.0000');
      expect(movements[1].direction).toBe('IN');

      const mat = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mDeclFixId },
      });
      expect(mat.currentStock.toFixed(4)).toBe('35.0000');

      const summary = await getSummary(owner.cookies, '2026-05');
      const row = rowFor(summary.body as InventorySummaryResponse, mDeclFixId);
      expect(row.openingQuantity).toBe('35.0000');
    });

    it('D-4: re-declaring identical count produces a 0-quantity movement and leaves stock unchanged', async () => {
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        {
          rawMaterialId: mDeclFixId,
          quantity: '35.0000',
          unitPrice: '10000.00',
        },
      ]);
      expect(res.status).toBe(200);
      const body = res.body as UpsertOpeningStockResponse;
      expect(body.data[0].appliedDelta).toBe('0.0000');

      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: mDeclFixId, referenceType: 'OPENING' },
      });
      expect(movements).toHaveLength(3);
      expect(movements[2].quantity.toFixed(4)).toBe('0.0000');

      const mat = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mDeclFixId },
      });
      expect(mat.currentStock.toFixed(4)).toBe('35.0000');
    });
  });

  // ── Case V: Validation & Atomicity ────────────────────────────────────────
  describe('Case V — validation & atomicity', () => {
    it('V-1: unitPrice omitted when no purchase exists returns 400', async () => {
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mAtom1Id, quantity: '10.0000' }, // missing unitPrice
      ]);
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toMatch(
        /unitPrice is required/,
      );
    });

    it('V-2: unitPrice supplied when purchase exists returns 400', async () => {
      // mMid has a purchase in May
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mMidId, quantity: '10.0000', unitPrice: '15000.00' },
      ]);
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toMatch(
        /must be omitted/,
      );
    });

    it('V-3: declaration driving stock negative returns 409 and writes nothing', async () => {
      // Purchase 100 in April, Sale 95 in May -> currentStock = 5
      await postPurchase(
        owner.cookies,
        mNegId,
        '100.0000',
        '10000.00',
        '2026-04-01T10:00:00.000Z',
      );
      await postSale(
        owner.cookies,
        pNegId,
        '95.0000',
        '2026-05-05T10:00:00.000Z',
      );

      const beforeMovements = await prisma.stockMovement.count({
        where: { rawMaterialId: mNegId },
      });
      const beforeMat = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mNegId },
      });

      // Declare May opened at 0.0000 -> delta = -100.0000 -> resultingStock = 5 - 100 = -95
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mNegId, quantity: '0.0000', unitPrice: '10000.00' },
      ]);
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toMatch(/negative/);

      const afterMovements = await prisma.stockMovement.count({
        where: { rawMaterialId: mNegId },
      });
      const afterMat = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mNegId },
      });
      expect(afterMovements).toBe(beforeMovements);
      expect(afterMat.currentStock.toFixed(4)).toBe(
        beforeMat.currentStock.toFixed(4),
      );
    });

    it('V-4: unknown rawMaterialId returns 404', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000999';
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: fakeId, quantity: '10.0000', unitPrice: '10000.00' },
      ]);
      expect(res.status).toBe(404);
    });

    it('V-5: duplicate rawMaterialId in single request returns 400', async () => {
      const res = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mAtom1Id, quantity: '10.0000', unitPrice: '10000.00' },
        { rawMaterialId: mAtom1Id, quantity: '20.0000', unitPrice: '10000.00' },
      ]);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/duplicate rawMaterialId/);
    });

    it('V-6: malformed period (2026-13) returns 400 on GET and PUT', async () => {
      const getSumRes = await getSummary(owner.cookies, '2026-13');
      expect(getSumRes.status).toBe(400);

      const getWsRes = await getWorksheet(owner.cookies, '2026-13');
      expect(getWsRes.status).toBe(400);

      const putRes = await putOpeningStock(owner.cookies, '2026-13', [
        { rawMaterialId: mAtom1Id, quantity: '10.0000', unitPrice: '10000.00' },
      ]);
      expect(putRes.status).toBe(400);
    });

    it('V-7: future period returns 400', async () => {
      const futureYear = new Date().getUTCFullYear() + 2;
      const futureMonth = `${futureYear}-01`;

      const res = await putOpeningStock(owner.cookies, futureMonth, [
        { rawMaterialId: mAtom1Id, quantity: '10.0000', unitPrice: '10000.00' },
      ]);
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toMatch(
        /has not started yet/,
      );
    });

    it('V-8: atomicity — request with 3 entries where 3rd is unknown rolls back entries 1 & 2', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000888';
      const beforeAtom1 = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mAtom1Id },
      });
      const beforeAtom2 = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mAtom2Id },
      });

      const res = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mAtom1Id, quantity: '15.0000', unitPrice: '10000.00' },
        { rawMaterialId: mAtom2Id, quantity: '25.0000', unitPrice: '10000.00' },
        { rawMaterialId: fakeId, quantity: '35.0000', unitPrice: '10000.00' },
      ]);
      expect(res.status).toBe(404);

      const declCount = await prisma.openingStock.count({
        where: { rawMaterialId: { in: [mAtom1Id, mAtom2Id] } },
      });
      expect(declCount).toBe(0);

      const afterAtom1 = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mAtom1Id },
      });
      const afterAtom2 = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mAtom2Id },
      });
      expect(afterAtom1.currentStock.toFixed(4)).toBe(
        beforeAtom1.currentStock.toFixed(4),
      );
      expect(afterAtom2.currentStock.toFixed(4)).toBe(
        beforeAtom2.currentStock.toFixed(4),
      );
    });
  });

  // ── Case G: Guards ────────────────────────────────────────────────────────
  describe('Case G — guards', () => {
    it('G-1: unauthenticated requests receive 401', async () => {
      const res1 = await request(app.getHttpServer()).get(
        '/api/v1/inventory/summary?period=2026-05',
      );
      expect(res1.status).toBe(401);

      const res2 = await request(app.getHttpServer()).get(
        '/api/v1/inventory/opening-stock?period=2026-05',
      );
      expect(res2.status).toBe(401);

      const res3 = await request(app.getHttpServer())
        .put('/api/v1/inventory/opening-stock')
        .send({ periodMonth: '2026-05', entries: [] });
      expect(res3.status).toBe(401);
    });

    it('G-2: KASIR receives 403 on all inventory endpoints', async () => {
      const res1 = await getSummary(kasir.cookies, '2026-05');
      expect(res1.status).toBe(403);

      const res2 = await getWorksheet(kasir.cookies, '2026-05');
      expect(res2.status).toBe(403);

      const res3 = await putOpeningStock(kasir.cookies, '2026-05', [
        { rawMaterialId: mAtom1Id, quantity: '10.0000', unitPrice: '10000.00' },
      ]);
      expect(res3.status).toBe(403);
    });

    it('G-3: ADMIN receives 403 on all inventory endpoints', async () => {
      const res1 = await getSummary(admin.cookies, '2026-05');
      expect(res1.status).toBe(403);

      const res2 = await getWorksheet(admin.cookies, '2026-05');
      expect(res2.status).toBe(403);

      const res3 = await putOpeningStock(admin.cookies, '2026-05', [
        { rawMaterialId: mAtom1Id, quantity: '10.0000', unitPrice: '10000.00' },
      ]);
      expect(res3.status).toBe(403);
    });

    it('G-4: OWNER receives 200 on all inventory endpoints', async () => {
      const res1 = await getSummary(owner.cookies, '2026-05');
      expect(res1.status).toBe(200);

      const res2 = await getWorksheet(owner.cookies, '2026-05');
      expect(res2.status).toBe(200);

      const res3 = await putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mAtom1Id, quantity: '10.0000', unitPrice: '10000.00' },
      ]);
      expect(res3.status).toBe(200);
    });
  });

  // ── Case C: Concurrency ───────────────────────────────────────────────────
  describe('Case C — concurrency', () => {
    it('C-1: concurrent PUTs with opposite entry order [{A,B}, {B,A}] succeed without deadlock', async () => {
      const req1 = putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mConcAId, quantity: '20.0000', unitPrice: '10000.00' },
        { rawMaterialId: mConcBId, quantity: '30.0000', unitPrice: '10000.00' },
      ]);
      const req2 = putOpeningStock(owner.cookies, '2026-05', [
        { rawMaterialId: mConcBId, quantity: '30.0000', unitPrice: '10000.00' },
        { rawMaterialId: mConcAId, quantity: '20.0000', unitPrice: '10000.00' },
      ]);

      const [res1, res2] = await Promise.all([req1, req2]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const matA = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mConcAId },
      });
      const matB = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mConcBId },
      });

      // Balances must equal the declared numbers once (not double-incremented)
      expect(matA.currentStock.toFixed(4)).toBe('20.0000');
      expect(matB.currentStock.toFixed(4)).toBe('30.0000');

      const countA = await prisma.openingStock.count({
        where: { rawMaterialId: mConcAId },
      });
      const countB = await prisma.openingStock.count({
        where: { rawMaterialId: mConcBId },
      });
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });
  });
});
