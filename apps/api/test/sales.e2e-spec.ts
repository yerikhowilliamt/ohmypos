// e2e tests run against the compose Postgres (host port 5433). Loading .env here
// keeps the connection string in one place rather than duplicated per suite.
import 'dotenv/config';
/**
 * OhMyPos — Sales E2E Tests (PRD §5.2, ADR-005, ADR-007, ADR-011, ADR-014,
 * ADR-015, ADR-016, Playbook §10).
 *
 * Auth-aware end-to-end test suite testing:
 * - HPP snapshot (per-unit, ADR-015) and its immutability after a later
 *   raw-material cost change (ADR-005)
 * - Stock decrement under FOR UPDATE lock, aggregated per raw material (ADR-007, ADR-015)
 * - Concurrency: lock contention on a shared material, AND lock-ordering
 *   safety across overlapping carts (ADR-016) — the two cases this phase
 *   exists for
 * - Rollback guarantees across the transactional Sale flow (Playbook §7)
 * - RBAC & BranchScopeGuard enforcement (a sale is branch-attributed and
 *   KASIR-creatable but scoped to their own branch only)
 * - Decimal scale preservation and stock-balance integrity re-derivation
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { SaleResponse } from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';

describe('Sales (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPassword123!';
  const owner = { email: 'sl-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'sl-admin@test.local', cookies: [] as string[] };
  const kasir1 = { email: 'sl-kasir1@test.local', cookies: [] as string[] };
  const kasir2 = { email: 'sl-kasir2@test.local', cookies: [] as string[] };

  let branch1Id: string;
  let branch2Id: string;
  let centralBranchId: string;
  let accountId: string;

  // Dedicated raw material / product pairs per scenario, so absolute stock
  // assertions never depend on test execution order (plan §10.7).
  let mBaseGulaId: string;
  let mBaseKopiId: string;
  let pBaseId: string;

  let mOverrideId: string;
  let pOverrideId: string;

  let mDupId: string;
  let pDupId: string;

  let mHppId: string;
  let pHppId: string;

  let mUjiSirupId: string;
  let pUjiLimitId: string;

  let mUjiM1Id: string;
  let mUjiM2Id: string;
  let pUjiP1Id: string;
  let pUjiP2Id: string;

  let mRollAId: string;
  let mRollBId: string;
  let pRollAId: string;
  let pRollBId: string;

  let pNoRecipeId: string;

  let mInactiveId: string;
  let pInactiveId: string;

  let mGuardId: string;
  let pGuardId: string;

  // Initial currentStock per raw material, for the integrity re-derivation
  // case (23) — the source of truth is what was CREATED, not a re-guess.
  const openingStock = new Map<string, Prisma.Decimal>();

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

    const centralBranch = await prisma.branch.upsert({
      where: { name: 'Umum' },
      update: {},
      create: { name: 'Umum', isSystem: true },
    });
    centralBranchId = centralBranch.id;

    const b1 = await prisma.branch.create({
      data: { name: 'SL Test Branch 1', address: 'Jl. Test 1' },
    });
    branch1Id = b1.id;

    const b2 = await prisma.branch.create({
      data: { name: 'SL Test Branch 2', address: 'Jl. Test 2' },
    });
    branch2Id = b2.id;

    const account = await prisma.account.create({
      data: { name: 'SL Test Account', type: 'CASH', openingBalance: '0' },
    });
    accountId = account.id;

    // Required by ADR-012; resolved by name inside SalesService, so no id is
    // captured here either — asserting the suite runs standalone (no db:seed).
    await prisma.category.upsert({
      where: { name: 'Penjualan' },
      update: {},
      create: { name: 'Penjualan', type: 'INFLOW' },
    });

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        { name: 'SL Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'SL Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'SL Kasir 1',
          email: kasir1.email,
          passwordHash,
          role: 'KASIR',
          branchId: branch1Id,
        },
        {
          name: 'SL Kasir 2',
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

    // ── Fixture: happy path / snapshot (cases 1-3, 14, 24) ──────────────────
    const mBaseGula = await createMaterial(
      'SL M-Base-Gula',
      'kg',
      '12000.00',
      '100.0000',
    );
    mBaseGulaId = mBaseGula.id;
    const mBaseKopi = await createMaterial(
      'SL M-Base-Kopi',
      'kg',
      '85000.00',
      '100.0000',
    );
    mBaseKopiId = mBaseKopi.id;
    const pBase = await createProduct('SL P-Base', '18000.00');
    pBaseId = pBase.id;
    await createRecipeItem(pBaseId, mBaseGulaId, '0.2500');
    await createRecipeItem(pBaseId, mBaseKopiId, '0.0180');

    // ── Fixture: price override flag (case 4) ────────────────────────────────
    const mOverride = await createMaterial(
      'SL M-Override',
      'pcs',
      '5000.00',
      '100.0000',
    );
    mOverrideId = mOverride.id;
    const pOverride = await createProduct('SL P-Override', '18000.00');
    pOverrideId = pOverride.id;
    await createRecipeItem(pOverrideId, mOverrideId, '0.1000');

    // ── Fixture: same product twice at two prices (case 5) ──────────────────
    const mDup = await createMaterial('SL M-Dup', 'pcs', '3000.00', '100.0000');
    mDupId = mDup.id;
    const pDup = await createProduct('SL P-Dup', '18000.00');
    pDupId = pDup.id;
    await createRecipeItem(pDupId, mDupId, '0.2000');

    // ── Fixture: HPP snapshot immutability (case 6) ──────────────────────────
    const mHpp = await createMaterial('SL M-Hpp', 'kg', '12000.00', '100.0000');
    mHppId = mHpp.id;
    const pHpp = await createProduct('SL P-Hpp', '18000.00');
    pHppId = pHpp.id;
    await createRecipeItem(pHppId, mHppId, '0.2500');

    // ── Fixture: lock contention (case 7) ────────────────────────────────────
    const mUjiSirup = await createMaterial(
      'SL Uji Sirup',
      'liter',
      '2000.00',
      '10.0000',
    );
    mUjiSirupId = mUjiSirup.id;
    const pUjiLimit = await createProduct('SL Uji Limit', '1000.00');
    pUjiLimitId = pUjiLimit.id;
    await createRecipeItem(pUjiLimitId, mUjiSirupId, '1.0000');

    // ── Fixture: lock ordering across overlapping carts (case 8) ────────────
    const mUjiM1 = await createMaterial(
      'SL Uji M1',
      'pcs',
      '100.00',
      '1000.0000',
    );
    mUjiM1Id = mUjiM1.id;
    const mUjiM2 = await createMaterial(
      'SL Uji M2',
      'pcs',
      '100.00',
      '1000.0000',
    );
    mUjiM2Id = mUjiM2.id;
    const pUjiP1 = await createProduct('SL Uji P1', '500.00');
    pUjiP1Id = pUjiP1.id;
    // Recipe rows inserted M1-then-M2 for P1, M2-then-M1 for P2. The service
    // sorts by rawMaterialId regardless (ADR-016), so this insertion order is
    // NOT what makes the test pass — it documents the "naive" ordering a
    // per-line lock strategy (rejected Option K1) would have been vulnerable to.
    await createRecipeItem(pUjiP1Id, mUjiM1Id, '0.1000');
    await createRecipeItem(pUjiP1Id, mUjiM2Id, '0.1000');
    const pUjiP2 = await createProduct('SL Uji P2', '500.00');
    pUjiP2Id = pUjiP2.id;
    await createRecipeItem(pUjiP2Id, mUjiM2Id, '0.1000');
    await createRecipeItem(pUjiP2Id, mUjiM1Id, '0.1000');

    // ── Fixture: rollback on partial shortfall / unknown product (cases 9-10) ─
    const mRollA = await createMaterial(
      'SL M-Roll-A',
      'pcs',
      '1000.00',
      '100.0000',
    );
    mRollAId = mRollA.id;
    const mRollB = await createMaterial(
      'SL M-Roll-B',
      'pcs',
      '1000.00',
      '1.0000',
    );
    mRollBId = mRollB.id;
    const pRollA = await createProduct('SL P-Roll-A', '1000.00');
    pRollAId = pRollA.id;
    await createRecipeItem(pRollAId, mRollAId, '1.0000');
    const pRollB = await createProduct('SL P-Roll-B', '1000.00');
    pRollBId = pRollB.id;
    await createRecipeItem(pRollBId, mRollBId, '1.0000');

    // ── Fixture: recipeless product (case 11) ────────────────────────────────
    const pNoRecipe = await createProduct('SL P-NoRecipe', '5000.00');
    pNoRecipeId = pNoRecipe.id;

    // ── Fixture: inactive product (case 12) ──────────────────────────────────
    const mInactive = await createMaterial(
      'SL M-Inactive',
      'pcs',
      '1000.00',
      '100.0000',
    );
    mInactiveId = mInactive.id;
    const pInactive = await prisma.product.create({
      data: { name: 'SL P-Inactive', sellPrice: '5000.00', isActive: false },
    });
    pInactiveId = pInactive.id;
    await createRecipeItem(pInactiveId, mInactiveId, '1.0000');

    // ── Fixture: guards (cases 16, 19, 20, 21) ───────────────────────────────
    const mGuard = await createMaterial(
      'SL M-Guard',
      'pcs',
      '1000.00',
      '1000.0000',
    );
    mGuardId = mGuard.id;
    const pGuard = await createProduct('SL P-Guard', '1000.00');
    pGuardId = pGuard.id;
    await createRecipeItem(pGuardId, mGuardId, '0.1000');
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

  async function createMaterial(
    name: string,
    unit: string,
    unitCost: string,
    currentStock: string,
  ) {
    const material = await prisma.rawMaterial.create({
      data: {
        name,
        unit,
        purchaseUnit: unit,
        unitCost,
        currentStock,
        lowStockThreshold: '0',
      },
    });
    openingStock.set(material.id, new Prisma.Decimal(currentStock));
    return material;
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

  async function postSale(cookies: string[], body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Cookie', cookies)
      .send(body);
  }

  async function voidSale(cookies: string[], id: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/sales/${id}/void`)
      .set('Cookie', cookies);
  }

  async function cleanup() {
    // SaleItem cascades from Sale, but deleted explicitly anyway to match the
    // repo's established style (Phase 4's SupplierPurchaseItem does the same
    // ahead of its Cascade parent).
    await prisma.saleItem.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { sourceType: 'SALE' },
          {
            branch: { name: { in: ['SL Test Branch 1', 'SL Test Branch 2'] } },
          },
        ],
      },
    });
    await prisma.stockMovement.deleteMany({
      where: { rawMaterial: { name: { startsWith: 'SL ' } } },
    });
    await prisma.recipeItem.deleteMany({
      where: { product: { name: { startsWith: 'SL ' } } },
    });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'SL ' } } });
    await prisma.rawMaterial.deleteMany({
      where: { name: { startsWith: 'SL ' } },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: [owner.email, admin.email, kasir1.email, kasir2.email] },
      },
    });
    await prisma.branch.deleteMany({
      where: { name: { in: ['SL Test Branch 1', 'SL Test Branch 2'] } },
    });
    await prisma.account.deleteMany({ where: { name: 'SL Test Account' } });
  }

  // ---------------------------------------------------------------------------
  // 1. Happy Path & the HPP Snapshot (ADR-005, ADR-015)
  // ---------------------------------------------------------------------------
  describe('Happy Path & Snapshot', () => {
    let happyPathSaleId: string;

    it('Case 1-3: a sale writes the totals, the ledger entry, and the stock movements — once', async () => {
      const gulaBefore = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mBaseGulaId },
      });
      const kopiBefore = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mBaseKopiId },
      });

      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T10:00:00.000Z',
        items: [{ productId: pBaseId, quantity: '2' }],
      });
      expect(res.status).toBe(201);
      const body = res.body as SaleResponse;
      happyPathSaleId = body.id;

      // Case 1: totals, PER-UNIT hppAtSale — this is decision 2's regression
      // test. "9060.00" here would mean someone changed the ADR-015 convention.
      expect(body.totalAmount).toBe('36000.00');
      expect(body.items[0].hppAtSale).toBe('4530.00');
      expect(body.totalHpp).toBe('9060.00');
      expect(body.grossMargin).toBe('26940.00');

      // Case 2: exactly one LedgerEntry, correctly attributed and sourced.
      const entries = await prisma.ledgerEntry.findMany({
        where: { sourceType: 'SALE', sourceId: body.id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('INFLOW');
      expect(entries[0].amount.toFixed(2)).toBe('36000.00');
      expect(entries[0].branchId).toBe(branch1Id);
      expect(body.ledgerEntryId).toBe(entries[0].id);

      // Case 3: exactly one StockMovement per material, aggregated (ADR-015 §3),
      // with unitCostAtMovement matching the material's cost at sale time, and
      // currentStock down by exactly the recipe-derived amount.
      const movements = await prisma.stockMovement.findMany({
        where: { referenceType: 'SALE', referenceId: body.id },
        orderBy: { rawMaterialId: 'asc' },
      });
      expect(movements).toHaveLength(2);
      for (const m of movements) {
        expect(m.direction).toBe('OUT');
      }
      const gulaMovement = movements.find(
        (m) => m.rawMaterialId === mBaseGulaId,
      )!;
      const kopiMovement = movements.find(
        (m) => m.rawMaterialId === mBaseKopiId,
      )!;
      expect(gulaMovement.quantity.toFixed(4)).toBe('0.5000');
      expect(gulaMovement.unitCostAtMovement.toFixed(2)).toBe('12000.00');
      expect(kopiMovement.quantity.toFixed(4)).toBe('0.0360');
      expect(kopiMovement.unitCostAtMovement.toFixed(2)).toBe('85000.00');

      const gulaAfter = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mBaseGulaId },
      });
      const kopiAfter = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mBaseKopiId },
      });
      expect(
        gulaBefore.currentStock.minus(gulaAfter.currentStock).toFixed(4),
      ).toBe('0.5000');
      expect(
        kopiBefore.currentStock.minus(kopiAfter.currentStock).toFixed(4),
      ).toBe('0.0360');
    });

    it('Case 4: a per-line override is flagged only when it differs from the master price', async () => {
      const overridden = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T10:05:00.000Z',
        items: [
          { productId: pOverrideId, quantity: '1', unitPrice: '15000.00' },
        ],
      });
      expect(overridden.status).toBe(201);
      const overriddenBody = overridden.body as SaleResponse;
      expect(overriddenBody.items[0].isPriceOverridden).toBe(true);
      expect(overriddenBody.items[0].unitPriceAtSale).toBe('15000.00');
      expect(overriddenBody.items[0].lineTotal).toBe('15000.00');

      const explicitMaster = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T10:06:00.000Z',
        items: [
          { productId: pOverrideId, quantity: '1', unitPrice: '18000.00' },
        ],
      });
      expect(explicitMaster.status).toBe(201);
      expect(
        (explicitMaster.body as SaleResponse).items[0].isPriceOverridden,
      ).toBe(false);
    });

    it('Case 5: the same product on two lines at two prices collapses to one StockMovement per material', async () => {
      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T10:10:00.000Z',
        items: [
          { productId: pDupId, quantity: '1', unitPrice: '18000.00' },
          { productId: pDupId, quantity: '1', unitPrice: '15000.00' },
        ],
      });
      expect(res.status).toBe(201);
      const body = res.body as SaleResponse;
      expect(body.items).toHaveLength(2);

      const movements = await prisma.stockMovement.findMany({
        where: { referenceType: 'SALE', referenceId: body.id },
      });
      expect(movements).toHaveLength(1);
      // 2 lines × 0.2000 = 0.4000, summed — not two separate 0.2000 rows (ADR-015 §3).
      expect(movements[0].quantity.toFixed(4)).toBe('0.4000');
    });

    it('Case 6: hppAtSale is immutable after a later raw-material cost change — ADR-005s headline guarantee', async () => {
      const sale = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T10:15:00.000Z',
        items: [{ productId: pHppId, quantity: '1' }],
      });
      expect(sale.status).toBe(201);
      const saleBody = sale.body as SaleResponse;
      expect(saleBody.items[0].hppAtSale).toBe('3000.00'); // 0.2500 × 12000.00

      await request(app.getHttpServer())
        .patch(`/api/v1/raw-materials/${mHppId}`)
        .set('Cookie', owner.cookies)
        .send({ unitCost: '20000.00' })
        .expect(200);

      // Live HPP moved...
      const liveProduct = await request(app.getHttpServer())
        .get(`/api/v1/products/${pHppId}`)
        .set('Cookie', owner.cookies)
        .expect(200);
      expect((liveProduct.body as { hpp: string | null }).hpp).toBe('5000.00'); // 0.2500 × 20000.00

      // ...but the snapshot did not.
      const soldSale = await request(app.getHttpServer())
        .get(`/api/v1/sales/${saleBody.id}`)
        .set('Cookie', owner.cookies)
        .expect(200);
      const soldSaleBody = soldSale.body as SaleResponse;
      expect(soldSaleBody.items[0].hppAtSale).toBe('3000.00');
      expect(soldSaleBody.grossMargin).toBe('15000.00'); // 18000.00 − 3000.00
    });

    afterAll(() => {
      // Case 24 (product delete blocked once sold) needs a sold product — the
      // happy-path sale above already made pBaseId one.
      expect(happyPathSaleId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Concurrency — the two cases this phase is built around (ADR-007, ADR-016)
  // ---------------------------------------------------------------------------
  describe('Concurrency', () => {
    it('Case 7: FOR UPDATE lock prevents over-selling under Promise.all', async () => {
      // 10.0000 in stock, two concurrent sales of quantity 6 each — only one can win.
      const [res1, res2] = await Promise.all([
        postSale(owner.cookies, {
          branchId: branch1Id,
          accountId,
          soldAt: '2026-08-16T11:00:00.000Z',
          items: [{ productId: pUjiLimitId, quantity: '6' }],
        }),
        postSale(owner.cookies, {
          branchId: branch1Id,
          accountId,
          soldAt: '2026-08-16T11:00:00.000Z',
          items: [{ productId: pUjiLimitId, quantity: '6' }],
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const material = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mUjiSirupId },
      });
      expect(material.currentStock.toFixed(4)).toBe('4.0000');

      const salesForProduct = await prisma.sale.findMany({
        where: { items: { some: { productId: pUjiLimitId } } },
      });
      expect(salesForProduct).toHaveLength(1);

      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: mUjiSirupId, direction: 'OUT' },
      });
      expect(movements).toHaveLength(1);

      const winner = res1.status === 201 ? res1 : res2;
      const ledgerCount = await prisma.ledgerEntry.count({
        where: {
          sourceType: 'SALE',
          sourceId: (winner.body as SaleResponse).id,
        },
      });
      expect(ledgerCount).toBe(1);
    });

    it('Case 8: overlapping carts on shared materials never deadlock, across 10 concurrent iterations', async () => {
      const results: number[] = [];
      for (let i = 0; i < 10; i++) {
        const [r1, r2] = await Promise.all([
          postSale(owner.cookies, {
            branchId: branch1Id,
            accountId,
            soldAt: '2026-08-16T12:00:00.000Z',
            items: [{ productId: pUjiP1Id, quantity: '1' }],
          }),
          postSale(owner.cookies, {
            branchId: branch1Id,
            accountId,
            soldAt: '2026-08-16T12:00:00.000Z',
            items: [{ productId: pUjiP2Id, quantity: '1' }],
          }),
        ]);
        results.push(r1.status, r2.status);
      }

      // Zero 500s — a deadlock (40P01) would surface as one here (plan §10.3a).
      expect(results.every((s) => s === 201)).toBe(true);
      expect(results).toHaveLength(20);

      const m1 = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mUjiM1Id },
      });
      const m2 = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mUjiM2Id },
      });
      // 10 iterations × (P1's 0.1 + P2's 0.1) = 2.0000 consumed from each.
      expect(
        openingStock.get(mUjiM1Id)!.minus(m1.currentStock).toFixed(4),
      ).toBe('2.0000');
      expect(
        openingStock.get(mUjiM2Id)!.minus(m2.currentStock).toFixed(4),
      ).toBe('2.0000');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Transaction Rollback Guarantees (Playbook §7)
  // ---------------------------------------------------------------------------
  describe('Rollback', () => {
    it('Case 9: insufficient stock on one line rolls the ENTIRE sale back, including satisfiable lines', async () => {
      const aBefore = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mRollAId },
      });
      const bBefore = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mRollBId },
      });

      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T13:00:00.000Z',
        items: [
          { productId: pRollAId, quantity: '1' }, // satisfiable (100 available)
          { productId: pRollBId, quantity: '5' }, // NOT satisfiable (1 available)
        ],
      });
      expect(res.status).toBe(409);

      // The POS renders this per cart line, so the body has to be machine-readable,
      // not just a human sentence. Only the short material is listed — the
      // satisfiable one must not appear.
      const body = res.body as {
        code: string;
        details: {
          shortfalls: {
            rawMaterialId: string;
            name: string;
            required: string;
            available: string;
          }[];
        };
      };
      expect(body.code).toBe('INSUFFICIENT_STOCK');
      expect(body.details.shortfalls).toHaveLength(1);
      expect(body.details.shortfalls[0]).toMatchObject({
        rawMaterialId: mRollBId,
        required: '5.0000',
        available: '1.0000',
      });

      const aAfter = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mRollAId },
      });
      const bAfter = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mRollBId },
      });
      // The satisfiable line's material must be untouched too — this is the
      // assertion that fails on a partial-commit implementation.
      expect(aAfter.currentStock.toFixed(4)).toBe(
        aBefore.currentStock.toFixed(4),
      );
      expect(bAfter.currentStock.toFixed(4)).toBe(
        bBefore.currentStock.toFixed(4),
      );

      const sales = await prisma.sale.findMany({
        where: { items: { some: { productId: { in: [pRollAId, pRollBId] } } } },
      });
      expect(sales).toHaveLength(0);
      const movements = await prisma.stockMovement.findMany({
        where: { rawMaterialId: { in: [mRollAId, mRollBId] } },
      });
      expect(movements).toHaveLength(0);
    });

    it('Case 10: an unknown product mid-cart rolls back and writes nothing', async () => {
      const aBefore = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mRollAId },
      });

      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T13:05:00.000Z',
        items: [
          { productId: pRollAId, quantity: '1' },
          { productId: '00000000-0000-4000-8000-00000000dead', quantity: '1' },
        ],
      });
      expect(res.status).toBe(404);

      const aAfter = await prisma.rawMaterial.findUniqueOrThrow({
        where: { id: mRollAId },
      });
      expect(aAfter.currentStock.toFixed(4)).toBe(
        aBefore.currentStock.toFixed(4),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Rejections (ADR-013, ADR-014, ADR-015)
  // ---------------------------------------------------------------------------
  describe('Rejections', () => {
    it('Case 11: a product with no recipe cannot be sold', async () => {
      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:00:00.000Z',
        items: [{ productId: pNoRecipeId, quantity: '1' }],
      });
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toContain(
        'SL P-NoRecipe',
      );
    });

    it('Case 12: an inactive product cannot be sold', async () => {
      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:05:00.000Z',
        items: [{ productId: pInactiveId, quantity: '1' }],
      });
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toContain(
        'SL P-Inactive',
      );
    });

    it('Case 13: the central branch cannot record a sale — there is no central sale', async () => {
      const res = await postSale(owner.cookies, {
        branchId: centralBranchId,
        accountId,
        soldAt: '2026-08-16T14:10:00.000Z',
        items: [{ productId: pBaseId, quantity: '1' }],
      });
      expect(res.status).toBe(400);
    });

    it('Case 14: validation edges are rejected at 400 before any service logic runs', async () => {
      await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:15:00.000Z',
        items: [{ productId: pBaseId, quantity: '0' }],
      }).then((r) => expect(r.status).toBe(400));

      await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:15:00.000Z',
        items: [{ productId: pBaseId, quantity: '1.00001' }],
      }).then((r) => expect(r.status).toBe(400));

      await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:15:00.000Z',
        items: [{ productId: pBaseId, quantity: '1', unitPrice: '18000.001' }],
      }).then((r) => expect(r.status).toBe(400));

      await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:15:00.000Z',
        items: [],
      }).then((r) => expect(r.status).toBe(400));

      const fiftyOneItems = Array.from({ length: 51 }, () => ({
        productId: pBaseId,
        quantity: '1',
      }));
      await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:15:00.000Z',
        items: fiftyOneItems,
      }).then((r) => expect(r.status).toBe(400));
    });

    it('Case 15: a client-supplied totalAmount and userId are ignored', async () => {
      const res = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T14:20:00.000Z',
        items: [{ productId: pBaseId, quantity: '1' }],
        totalAmount: '1.00',
        userId: '00000000-0000-4000-8000-00000000beef',
      });
      expect(res.status).toBe(201);
      const body = res.body as SaleResponse;
      expect(body.totalAmount).toBe('18000.00');

      const ownerUser = await prisma.user.findUniqueOrThrow({
        where: { email: owner.email },
      });
      expect(body.userId).toBe(ownerUser.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Guards (ADR-011, Playbook §8, plan §7.3)
  // ---------------------------------------------------------------------------
  describe('Guards', () => {
    let branch1SaleId: string;

    it('Case 16: KASIR posting their OWN branch succeeds', async () => {
      const res = await postSale(kasir1.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(res.status).toBe(201);
      branch1SaleId = (res.body as SaleResponse).id;
    });

    it('Case 17: KASIR posting ANOTHER branch is rejected', async () => {
      const res = await postSale(kasir1.cookies, {
        branchId: branch2Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(res.status).toBe(403);
    });

    it('Case 18: KASIR omitting branchId entirely is rejected by the guard, not the pipe (403, not 400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', kasir1.cookies)
        .send({
          accountId,
          soldAt: new Date().toISOString(),
          items: [{ productId: pGuardId, quantity: '1' }],
        });
      expect(res.status).toBe(403);
    });

    it('Case 19: KASIR listing sales sees only their own branch', async () => {
      const branch2Sale = await postSale(owner.cookies, {
        branchId: branch2Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(branch2Sale.status).toBe(201);
      const branch2SaleId = (branch2Sale.body as SaleResponse).id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/sales?branchId=${branch1Id}`)
        .set('Cookie', kasir1.cookies);
      expect(res.status).toBe(200);
      const ids = (res.body as { data: SaleResponse[] }).data.map((s) => s.id);
      expect(ids).not.toContain(branch2SaleId);
    });

    it('Case 20: GET /sales/:id is OWNER/ADMIN only, not KASIR', async () => {
      const asKasir = await request(app.getHttpServer())
        .get(`/api/v1/sales/${branch1SaleId}`)
        .set('Cookie', kasir1.cookies);
      expect(asKasir.status).toBe(403);

      const asAdmin = await request(app.getHttpServer())
        .get(`/api/v1/sales/${branch1SaleId}`)
        .set('Cookie', admin.cookies);
      expect(asAdmin.status).toBe(200);
    });

    it('Case 21: ADMIN and OWNER can both create sales', async () => {
      const asAdmin = await postSale(admin.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T15:04:00.000Z',
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(asAdmin.status).toBe(201);

      const asOwner = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: '2026-08-16T15:05:00.000Z',
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(asOwner.status).toBe(201);
    });

    it('Case 22: unauthenticated requests are rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .send({
          branchId: branch1Id,
          accountId,
          soldAt: '2026-08-16T15:06:00.000Z',
          items: [{ productId: pGuardId, quantity: '1' }],
        })
        .expect(401);

      await request(app.getHttpServer()).get('/api/v1/sales').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 5b. Backdate limit — KASIR only (DEF-QA-06 / TASK-087)
  // ---------------------------------------------------------------------------
  describe('Backdate limit', () => {
    it('rejects a KASIR sale dated more than 3 days in the past', async () => {
      const tooOld = new Date();
      tooOld.setUTCDate(tooOld.getUTCDate() - 4);

      const res = await postSale(kasir1.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: tooOld.toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'batas input susulan',
      );
    });

    it('allows a KASIR sale dated within the 3-day backdate window', async () => {
      const withinWindow = new Date();
      withinWindow.setUTCDate(withinWindow.getUTCDate() - 2);

      const res = await postSale(kasir1.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: withinWindow.toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(res.status).toBe(201);
    });

    it('exempts OWNER and ADMIN from the KASIR backdate limit', async () => {
      const wayOld = new Date();
      wayOld.setUTCDate(wayOld.getUTCDate() - 10);

      const asOwner = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: wayOld.toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(asOwner.status).toBe(201);

      const asAdmin = await postSale(admin.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: wayOld.toISOString(),
        items: [{ productId: pGuardId, quantity: '1' }],
      });
      expect(asAdmin.status).toBe(201);
    });
  });

  describe('Price override restriction (DEBT-009)', () => {
    // KASIR's 3-day backdate limit (see 'Backdate limit' above) runs before
    // this check in Phase 1 — use "now", not a fixed historical date, so
    // these cases actually exercise the override check, not the date guard.
    it('rejects a KASIR sale with a per-line price that differs from the master price', async () => {
      const res = await postSale(kasir1.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [
          { productId: pOverrideId, quantity: '1', unitPrice: '15000.00' },
        ],
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'tidak diizinkan mengubah harga',
      );
    });

    it('allows a KASIR sale that sends the exact master price explicitly', async () => {
      const res = await postSale(kasir1.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [
          { productId: pOverrideId, quantity: '1', unitPrice: '18000.00' },
        ],
      });
      expect(res.status).toBe(201);
    });

    it('allows a KASIR sale with no unitPrice at all', async () => {
      const res = await postSale(kasir1.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pOverrideId, quantity: '1' }],
      });
      expect(res.status).toBe(201);
    });

    it('still allows ADMIN and OWNER to override a line price', async () => {
      const asAdmin = await postSale(admin.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [
          { productId: pOverrideId, quantity: '1', unitPrice: '15000.00' },
        ],
      });
      expect(asAdmin.status).toBe(201);

      const asOwner = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [
          { productId: pOverrideId, quantity: '1', unitPrice: '15000.00' },
        ],
      });
      expect(asOwner.status).toBe(201);
    });
  });

  describe('Void (DEBT-010)', () => {
    it('rejects a KASIR attempt to void a sale', async () => {
      const created = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pBaseId, quantity: '1' }],
      });
      expect(created.status).toBe(201);

      const res = await voidSale(
        kasir1.cookies,
        (created.body as SaleResponse).id,
      );
      expect(res.status).toBe(403);
    });

    it('allows ADMIN/OWNER to void within the window, and fully reverses stock + cash', async () => {
      const [gulaBefore, kopiBefore] = await Promise.all([
        prisma.rawMaterial.findUniqueOrThrow({ where: { id: mBaseGulaId } }),
        prisma.rawMaterial.findUniqueOrThrow({ where: { id: mBaseKopiId } }),
      ]);
      const accountBefore = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
      });

      const created = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pBaseId, quantity: '2' }],
      });
      expect(created.status).toBe(201);
      const saleId = (created.body as SaleResponse).id;

      const voided = await voidSale(admin.cookies, saleId);
      expect(voided.status).toBe(201);
      const voidedBody = voided.body as SaleResponse;
      expect(voidedBody.status).toBe('VOIDED');
      expect(voidedBody.voidedAt).not.toBeNull();
      expect(voidedBody.voidedByUserId).toBeTruthy();

      const [gulaAfter, kopiAfter] = await Promise.all([
        prisma.rawMaterial.findUniqueOrThrow({ where: { id: mBaseGulaId } }),
        prisma.rawMaterial.findUniqueOrThrow({ where: { id: mBaseKopiId } }),
      ]);
      // Sale consumed 2 × recipe, void puts every bit of it back — net zero.
      expect(gulaAfter.currentStock.toFixed(4)).toBe(
        gulaBefore.currentStock.toFixed(4),
      );
      expect(kopiAfter.currentStock.toFixed(4)).toBe(
        kopiBefore.currentStock.toFixed(4),
      );

      const accountAfter = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
      });
      // Cash view: the reversal is a real OUTFLOW ledger entry, not a delete —
      // Account itself has no stored balance column (it's derived from
      // LedgerEntry at query time), so this just confirms the row wasn't
      // mutated in place.
      expect(accountAfter.updatedAt.getTime()).toBe(
        accountBefore.updatedAt.getTime(),
      );

      const reversalEntry = await prisma.ledgerEntry.findFirst({
        where: { sourceType: 'SALE_VOID', sourceId: saleId },
      });
      expect(reversalEntry).not.toBeNull();
      expect(reversalEntry!.type).toBe('OUTFLOW');
      expect(reversalEntry!.amount.toFixed(2)).toBe(
        (created.body as SaleResponse).totalAmount,
      );
    });

    it('rejects voiding the same sale twice, including under a concurrent double-attempt', async () => {
      const created = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: new Date().toISOString(),
        items: [{ productId: pBaseId, quantity: '1' }],
      });
      const saleId = (created.body as SaleResponse).id;

      const [first, second] = await Promise.all([
        voidSale(owner.cookies, saleId),
        voidSale(owner.cookies, saleId),
      ]);
      const statuses = [first.status, second.status].sort();
      // One wins (201), one loses (400) — never both succeed, never both fail.
      expect(statuses).toEqual([201, 400]);

      const third = await voidSale(owner.cookies, saleId);
      expect(third.status).toBe(400);
    });

    it('rejects a void attempted after the window has expired', async () => {
      const old = new Date(Date.now() - 45 * 60_000); // 45 min ago > 30 min window
      const created = await postSale(owner.cookies, {
        branchId: branch1Id,
        accountId,
        soldAt: old.toISOString(),
        items: [{ productId: pBaseId, quantity: '1' }],
      });
      expect(created.status).toBe(201);

      const res = await voidSale(
        owner.cookies,
        (created.body as SaleResponse).id,
      );
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'batas waktu pembatalan',
      );
    });

    it('404s voiding a sale that does not exist', async () => {
      const res = await voidSale(
        owner.cookies,
        '99999999-9999-4999-8999-999999999999',
      );
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Integrity & the ProductInUse guard (decision 8)
  // ---------------------------------------------------------------------------
  describe('Integrity', () => {
    it('Case 23: every raw material this suite touched re-derives to its recorded currentStock', async () => {
      for (const [rawMaterialId, opening] of openingStock.entries()) {
        const movements = await prisma.stockMovement.findMany({
          where: { rawMaterialId },
        });
        const inSum = movements
          .filter((m) => m.direction === 'IN')
          .reduce((sum, m) => sum.plus(m.quantity), new Prisma.Decimal(0));
        const outSum = movements
          .filter((m) => m.direction === 'OUT')
          .reduce((sum, m) => sum.plus(m.quantity), new Prisma.Decimal(0));
        const expected = opening.plus(inSum).minus(outSum);

        const material = await prisma.rawMaterial.findUniqueOrThrow({
          where: { id: rawMaterialId },
        });
        expect(material.currentStock.toFixed(4)).toBe(expected.toFixed(4));
      }
    });

    it('Case 24: a product that has been sold cannot be deleted', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/products/${pBaseId}`)
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(409);

      const stillExists = await prisma.product.findUnique({
        where: { id: pBaseId },
      });
      expect(stillExists).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Pagination & sorting (TASK-067)
  //
  // `sortOrder` existed on the frontend for months while SaleQuerySchema had no
  // such field: Zod stripped it and the service hardcoded 'desc'. These cases
  // exist so that regression cannot come back silently.
  // ---------------------------------------------------------------------------
  describe('Pagination & Sorting', () => {
    it('Case 25: sortOrder=asc actually reverses the ordering', async () => {
      const asc = await request(app.getHttpServer())
        .get('/api/v1/sales?sortBy=soldAt&sortOrder=asc&limit=10&page=1')
        .set('Cookie', owner.cookies);
      expect(asc.status).toBe(200);

      const ascBody = asc.body as { data: SaleResponse[] };
      expect(ascBody.data.length).toBeGreaterThan(1);

      const times = ascBody.data.map((s) => new Date(s.soldAt).getTime());
      for (let i = 1; i < times.length; i += 1) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
      }

      const desc = await request(app.getHttpServer())
        .get('/api/v1/sales?sortBy=soldAt&sortOrder=desc&limit=10&page=1')
        .set('Cookie', owner.cookies);
      expect(desc.status).toBe(200);

      const descBody = desc.body as { data: SaleResponse[] };
      expect(descBody.data[0]?.id).not.toBe(ascBody.data[0]?.id);
    });

    it('Case 26: sortBy=totalAmount orders by money, not by date', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales?sortBy=totalAmount&sortOrder=asc&limit=10&page=1')
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(200);

      const amounts = (res.body as { data: SaleResponse[] }).data.map((s) =>
        Number(s.totalAmount),
      );
      for (let i = 1; i < amounts.length; i += 1) {
        expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
      }
    });

    it('Case 27: consecutive pages are disjoint and meta.totalPages is consistent', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/sales?page=1&limit=2&sortBy=soldAt&sortOrder=desc')
        .set('Cookie', owner.cookies);
      const page2 = await request(app.getHttpServer())
        .get('/api/v1/sales?page=2&limit=2&sortBy=soldAt&sortOrder=desc')
        .set('Cookie', owner.cookies);

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);

      const b1 = page1.body as {
        data: SaleResponse[];
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      };
      const b2 = page2.body as { data: SaleResponse[] };

      expect(b1.data).toHaveLength(2);
      expect(b1.meta.page).toBe(1);
      expect(b1.meta.limit).toBe(2);
      expect(b1.meta.totalPages).toBe(Math.ceil(b1.meta.total / 2));

      const ids1 = new Set(b1.data.map((s) => s.id));
      for (const sale of b2.data) {
        expect(ids1.has(sale.id)).toBe(false);
      }
    });

    it('Case 28: an unknown sortOrder is rejected, not coerced', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales?sortOrder=sideways')
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(400);
    });

    it('Case 29: an unknown sortBy is rejected, not passed to Prisma', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales?sortBy=totalHpp')
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Server-side search (TASK-072, DEBT-047)
  //
  // The toolbar search on the sales history table was a TanStack column filter
  // over the rows already on screen: it searched one page while looking like it
  // searched the whole history. Counts here are asserted RELATIVELY (against
  // the unfiltered total) rather than absolutely, because the sales in this
  // database are whatever the cases above created.
  // ---------------------------------------------------------------------------
  describe('Server-side search', () => {
    interface SaleList {
      data: SaleResponse[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }

    async function list(query: string): Promise<SaleList> {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sales?${query}`)
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(200);
      return res.body as SaleList;
    }

    it('Case 30: matches the branch name, case-insensitively', async () => {
      // Lowercase keyword against 'SL Test Branch 1'. Removing
      // `mode: 'insensitive'` from the service turns this red.
      const all = await list('limit=100');
      const body = await list('search=sl test branch 1&limit=100');

      expect(body.meta.total).toBeGreaterThan(0);
      expect(body.meta.total).toBeLessThan(all.meta.total);
      expect(body.data.every((s) => s.branchName === 'SL Test Branch 1')).toBe(
        true,
      );
    });

    it('Case 31: matches the cashier name', async () => {
      // The cashier is read off the data rather than hardcoded: which of this
      // suite's users ends up owning a sale depends on the cases above.
      const all = await list('limit=100');
      const cashier = all.data[0].cashierName;

      const body = await list(
        `search=${encodeURIComponent(cashier.toLowerCase())}&limit=100`,
      );
      expect(body.meta.total).toBeGreaterThan(0);
      expect(body.data.every((s) => s.cashierName === cashier)).toBe(true);
    });

    it('Case 32: matches the account name', async () => {
      const body = await list('search=sl test account&limit=100');
      expect(body.meta.total).toBeGreaterThan(0);
      expect(body.data.every((s) => s.accountName === 'SL Test Account')).toBe(
        true,
      );
    });

    it('Case 33: finds a sale by its id, from beyond the first page', async () => {
      // The whole point of the task. The target is deliberately taken from the
      // END of the ordered list, so a client-side filter over page 1 could
      // never have produced it.
      const all = await list('limit=100&sortBy=soldAt&sortOrder=desc');
      expect(all.data.length).toBeGreaterThan(1);
      const target = all.data[all.data.length - 1];

      const firstPage = await list(
        'limit=1&page=1&sortBy=soldAt&sortOrder=desc',
      );
      expect(firstPage.data[0].id).not.toBe(target.id);

      const body = await list(`search=${target.id}&limit=100`);
      expect(body.meta.total).toBe(1);
      expect(body.data[0].id).toBe(target.id);
    });

    it('Case 34: shrinks meta.total, not just the rows returned', async () => {
      // `data.length` alone would pass on a service that filtered the page it
      // had already fetched; `total` comes from a separate count(where).
      const all = await list('limit=100');
      const target = all.data[0];

      const body = await list(`search=${target.id}&limit=100`);
      expect(body.meta.total).toBe(1);
      expect(body.meta.totalPages).toBe(1);
    });

    it('Case 35: treats an empty search as no filter at all', async () => {
      const all = await list('limit=100');
      const body = await list('search=&limit=100');
      expect(body.meta.total).toBe(all.meta.total);
    });

    it('Case 36: ANDs with branchId instead of replacing it', async () => {
      // 'SL Test Branch' matches BOTH branches; the branchId must still narrow
      // the result to one of them.
      const both = await list('search=sl test branch&limit=100');
      const scoped = await list(
        `search=sl test branch&branchId=${branch2Id}&limit=100`,
      );

      expect(scoped.meta.total).toBeGreaterThan(0);
      expect(scoped.meta.total).toBeLessThan(both.meta.total);
      expect(scoped.data.every((s) => s.branchId === branch2Id)).toBe(true);
    });

    it('Case 37: returns an empty page, not an error, for a keyword nothing matches', async () => {
      const body = await list('search=tidak-ada-transaksi-ini&limit=100');
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
      expect(body.meta.totalPages).toBe(1);
    });
  });
});
