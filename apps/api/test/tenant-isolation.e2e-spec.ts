import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import {
  PrismaService,
  UnscopedPrismaService,
} from '../src/common/prisma/prisma.service';
import { tenantBoundExtension } from '../src/common/prisma/tenant.extension';
import { resetDatabase } from './reset-database';

/**
 * ADR-025 Decision 3(c) — the suite the whole multi-tenant conversion rests on.
 *
 * Three layers are supposed to keep tenants apart: the Prisma client extension,
 * the composite foreign keys, and hand-written `tenant_id` predicates in the
 * raw SQL the extension cannot see (`reports.service.ts`, DEBT-064). Only the
 * first two fail loudly on their own. This suite is the only thing standing
 * behind the third, and the only thing that checks all three from the outside.
 *
 * **Every fixture below is deliberately named identically in both tenants.**
 * That is not tidiness — it is half the test. A leak that returns "Cabang
 * Utama" when the other tenant also has a "Cabang Utama" is invisible to an
 * assertion on names, so every assertion here is on IDs. The duplicate names
 * simultaneously prove the eight global uniques really did become composite
 * (plan §1.3): if they had not, the second tenant's fixtures would not insert
 * at all and this suite would fail in `beforeAll`.
 *
 * The one name that is NOT duplicated is the owner's email, because
 * `users.email` stays globally unique by decision (ADR-025 Decision 6) — that
 * is what keeps the login page free of a tenant selector.
 */

const PASSWORD = 'IsoPass123!';

/** What one tenant's world looks like. Both are built identically. */
interface TenantWorld {
  tenantId: string;
  slug: string;
  prisma: PrismaService;
  cookies: string[];
  ownerId: string;
  branchId: string;
  systemBranchId: string;
  accountId: string;
  categoryId: string;
  supplierId: string;
  rawMaterialId: string;
  productId: string;
  ledgerEntryId: string;
  /** The INFLOW amount, different per tenant so a report leak changes the sum. */
  inflow: string;
}

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let unscoped: UnscopedPrismaService;
  let a: TenantWorld;
  let b: TenantWorld;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new PostgresTriggerExceptionFilter());
    await app.init();

    unscoped = app.get(UnscopedPrismaService);
    await resetDatabase(unscoped);
    await deleteIsolationTenants();

    a = await buildWorld('iso-a', '100000.00');
    b = await buildWorld('iso-b', '250000.00');
  });

  afterAll(async () => {
    await resetDatabase(unscoped);
    await deleteIsolationTenants();
    await app.close();
  });

  // --- fixtures ------------------------------------------------------------

  async function deleteIsolationTenants(): Promise<void> {
    const rows = await unscoped.tenant.findMany({
      where: { slug: { startsWith: 'iso-' } },
      select: { id: true },
    });
    if (rows.length === 0) return;
    const ids = rows.map((t) => t.id);
    // `resetDatabase` leaves `business_profiles` alone (it is a per-tenant
    // singleton every other suite upserts), so it has to go before the tenant.
    await unscoped.businessProfile.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await unscoped.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  async function buildWorld(
    slug: string,
    inflow: string,
  ): Promise<TenantWorld> {
    const tenant = await unscoped.tenant.create({
      data: { name: `Bisnis ${slug}`, slug },
    });
    const prisma = unscoped.$extends(
      tenantBoundExtension(tenant.id),
    ) as unknown as PrismaService;

    // Identical names in both tenants, on purpose — see the file comment.
    const systemBranch = await prisma.branch.create({
      data: { name: 'Umum', isSystem: true },
    });
    const branch = await prisma.branch.create({
      data: { name: 'Cabang Utama', isMainStore: true },
    });
    const account = await prisma.account.create({
      data: { name: 'Kas Utama', type: 'CASH', openingBalance: '0' },
    });
    const category = await prisma.category.create({
      data: { name: 'Penjualan', type: 'INFLOW' },
    });
    await prisma.category.create({
      data: { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' },
    });
    const supplier = await prisma.supplier.create({
      data: { name: 'PT Pemasok Sama' },
    });
    const rawMaterial = await prisma.rawMaterial.create({
      data: {
        name: 'Gula',
        unit: 'gram',
        purchaseUnit: 'kg',
        conversionFactor: '1000',
        unitCost: '15.000000',
      },
    });
    const product = await prisma.product.create({
      data: { name: 'Es Kopi Susu', sellPrice: '18000' },
    });

    const ledgerEntry = await prisma.ledgerEntry.create({
      data: {
        accountId: account.id,
        categoryId: category.id,
        branchId: branch.id,
        entryDate: new Date('2026-08-15T03:00:00.000Z'),
        amount: inflow,
        type: 'INFLOW',
        sourceType: 'MANUAL',
        note: `Pemasukan ${slug}`,
      },
    });

    // Email is the one thing that CANNOT collide (ADR-025 Decision 6).
    const owner = await prisma.user.create({
      data: {
        name: 'Owner',
        email: `owner-${slug}@test.local`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: 'OWNER',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: PASSWORD })
      .expect(200);

    return {
      tenantId: tenant.id,
      slug,
      prisma,
      cookies: res.get('Set-Cookie') ?? [],
      ownerId: owner.id,
      branchId: branch.id,
      systemBranchId: systemBranch.id,
      accountId: account.id,
      categoryId: category.id,
      supplierId: supplier.id,
      rawMaterialId: rawMaterial.id,
      productId: product.id,
      ledgerEntryId: ledgerEntry.id,
      inflow,
    };
  }

  function readBody<T>(res: { body: unknown }): T {
    return res.body as T;
  }

  /** Ids in a list response, whether it is a bare array or `{ data: [...] }`. */
  function idsOf(res: { body: unknown }): string[] {
    const body = res.body as { data?: { id: string }[] } | { id: string }[];
    const rows = Array.isArray(body) ? body : (body.data ?? []);
    return rows.map((row) => row.id);
  }

  // --- the fixtures themselves prove the composite uniques -----------------

  it('let both tenants hold identically named rows', () => {
    // If any of the eight uniques from plan §1.3 had stayed global, the second
    // `buildWorld` would have thrown in `beforeAll` and nothing here would run.
    expect(a.tenantId).not.toBe(b.tenantId);
    expect(a.branchId).not.toBe(b.branchId);
    expect(a.productId).not.toBe(b.productId);
  });

  it('keeps user email globally unique across tenants (ADR-025 Decision 6)', async () => {
    await expect(
      b.prisma.user.create({
        data: {
          name: 'Bentrok',
          email: `owner-${a.slug}@test.local`,
          passwordHash: 'x',
          role: 'ADMIN',
          branchId: b.branchId,
        },
      }),
    ).rejects.toThrow();
  });

  // --- list endpoints ------------------------------------------------------

  const LIST_ROUTES = [
    '/api/v1/accounts',
    '/api/v1/branches',
    '/api/v1/categories',
    '/api/v1/suppliers',
    '/api/v1/raw-materials',
    '/api/v1/products',
    '/api/v1/users',
    '/api/v1/ledger-entries',
    '/api/v1/sales',
    '/api/v1/supplier-purchases',
    '/api/v1/payables',
    '/api/v1/stock-movements',
    '/api/v1/devices',
    '/api/v1/leave-requests',
  ];

  describe('list endpoints never return the other tenant’s rows', () => {
    it.each(LIST_ROUTES)('%s', async (route) => {
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).get(route).set('Cookie', a.cookies),
        request(app.getHttpServer()).get(route).set('Cookie', b.cookies),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const idsA = idsOf(resA);
      const idsB = idsOf(resB);

      // Compared by ID, never by name — every fixture shares a name with its
      // twin, so a name-based assertion would pass on a leak.
      const overlap = idsA.filter((id) => idsB.includes(id));
      expect({ route, overlap }).toEqual({ route, overlap: [] });
    });

    it('/inventory/summary — keyed on rawMaterialId, not id', async () => {
      // Its own case because this response is `{ period, data: [...] }` with
      // `rawMaterialId` rather than `id`, and it takes a calendar month rather
      // than a date range.
      const route = '/api/v1/inventory/summary?period=2026-08';
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).get(route).set('Cookie', a.cookies),
        request(app.getHttpServer()).get(route).set('Cookie', b.cookies),
      ]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const pick = (res: { body: unknown }) =>
        readBody<{ data: { rawMaterialId: string }[] }>(res).data.map(
          (row) => row.rawMaterialId,
        );
      expect(pick(resA)).toEqual([a.rawMaterialId]);
      expect(pick(resB)).toEqual([b.rawMaterialId]);
    });

    it('returns each tenant its OWN rows, not an empty list', async () => {
      // Guards against the opposite failure: a filter so tight it returns
      // nothing would pass every disjointness check above.
      const res = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', a.cookies);
      expect(idsOf(res)).toEqual(
        expect.arrayContaining([a.branchId, a.systemBranchId]),
      );
      expect(idsOf(res)).not.toContain(b.branchId);
    });
  });

  // --- detail endpoints ----------------------------------------------------

  describe('detail endpoints answer 404 for the other tenant’s id', () => {
    /**
     * 404, never 403. A 403 would confirm the row exists — which is itself the
     * leak, one bit at a time: an operator of tenant A could walk ids and learn
     * exactly which of them belong to somebody. The extension produces this for
     * free by narrowing the `where`, so what is really being asserted is that
     * no endpoint hand-rolls a "not yours" branch on top of it.
     */
    it.each([
      ['accounts', () => b.accountId],
      ['branches', () => b.branchId],
      ['categories', () => b.categoryId],
      ['suppliers', () => b.supplierId],
      ['raw-materials', () => b.rawMaterialId],
      ['products', () => b.productId],
      ['users', () => b.ownerId],
      ['ledger-entries', () => b.ledgerEntryId],
    ])('GET /%s/:id', async (resource, idOf) => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/${resource}/${idOf()}`)
        .set('Cookie', a.cookies);
      expect({ resource, status: res.status }).toEqual({
        resource,
        status: 404,
      });
    });

    it('still returns 200 for the tenant’s own id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${a.productId}`)
        .set('Cookie', a.cookies)
        .expect(200);
    });
  });

  // --- writes that reference the other tenant ------------------------------

  describe('writes cannot reach across tenants', () => {
    it('rejects a ledger entry pointing at the other tenant’s account', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', a.cookies)
        .send({
          accountId: b.accountId,
          categoryId: a.categoryId,
          branchId: a.branchId,
          entryDate: '2026-08-15',
          amount: '5000.00',
          type: 'OUTFLOW',
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a ledger entry pointing at the other tenant’s branch', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', a.cookies)
        .send({
          accountId: a.accountId,
          categoryId: a.categoryId,
          branchId: b.branchId,
          entryDate: '2026-08-15',
          amount: '5000.00',
          type: 'OUTFLOW',
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('refuses to update the other tenant’s row', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/suppliers/${b.supplierId}`)
        .set('Cookie', a.cookies)
        .send({ name: 'Diambil alih' });
      expect(res.status).toBe(404);

      // And the row is untouched, which is the assertion that matters — a 404
      // returned after a successful write would be the worst of both.
      const supplier = await b.prisma.supplier.findUniqueOrThrow({
        where: { id: b.supplierId },
      });
      expect(supplier.name).toBe('PT Pemasok Sama');
    });

    it('refuses to delete the other tenant’s row', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/suppliers/${b.supplierId}`)
        .set('Cookie', a.cookies);
      expect(res.status).toBe(404);
      await expect(
        b.prisma.supplier.findUnique({ where: { id: b.supplierId } }),
      ).resolves.not.toBeNull();
    });

    it('stops a cross-tenant reference at the DATABASE, not just the service', async () => {
      // The composite FK layer (ADR-025 Decision 3b) on its own, with the
      // client extension deliberately bypassed. This is the guarantee that
      // survives a service-layer mistake.
      await expect(
        unscoped.ledgerEntry.create({
          data: {
            tenantId: a.tenantId,
            accountId: b.accountId,
            categoryId: a.categoryId,
            branchId: a.branchId,
            entryDate: new Date(),
            amount: '1.00',
            type: 'OUTFLOW',
          },
        }),
      ).rejects.toThrow();
    });
  });

  // --- reports: the raw-SQL layer the extension cannot see ------------------

  describe('reports (DEBT-064 — hand-written tenant_id predicates)', () => {
    const RANGE = 'startDate=2026-08-01&endDate=2026-08-31';

    it('profit-loss counts only the caller’s money', async () => {
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/reports/profit-loss?${RANGE}`)
          .set('Cookie', a.cookies)
          .expect(200),
        request(app.getHttpServer())
          .get(`/api/v1/reports/profit-loss?${RANGE}`)
          .set('Cookie', b.cookies)
          .expect(200),
      ]);

      const totalA = readBody<{ otherIncome: string }>(resA).otherIncome;
      const totalB = readBody<{ otherIncome: string }>(resB).otherIncome;

      // The amounts differ per tenant precisely so a missing predicate shows up
      // as a wrong NUMBER rather than as an extra row nobody looks at: leaking
      // would make both sides 350000.00.
      expect(Number(totalA)).toBe(Number(a.inflow));
      expect(Number(totalB)).toBe(Number(b.inflow));
    });

    it('daily-income counts only the caller’s money', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/daily-income?${RANGE}`)
        .set('Cookie', a.cookies)
        .expect(200);

      const body = readBody<{ rows: { income: string }[]; total: string }>(res);
      const sum = body.rows.reduce(
        (total, day) => total + Number(day.income),
        0,
      );
      expect(sum).toBe(Number(a.inflow));
      expect(Number(body.total)).toBe(Number(a.inflow));
    });

    it('cash-balance counts only the caller’s accounts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/cash-balance?asOfDate=2026-08-31')
        .set('Cookie', a.cookies)
        .expect(200);

      const body = readBody<{ accounts: { accountId: string }[] }>(res);
      const ids = body.accounts.map((account) => account.accountId);
      expect(ids).toContain(a.accountId);
      expect(ids).not.toContain(b.accountId);
    });

    it('income-by-payment-method counts only the caller’s accounts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/income-by-payment-method?${RANGE}`)
        .set('Cookie', a.cookies)
        .expect(200);

      const body = readBody<{
        rows: { accountId: string }[];
        total: string;
      }>(res);
      const ids = body.rows.map((row) => row.accountId);
      expect(ids).toContain(a.accountId);
      expect(ids).not.toContain(b.accountId);
      expect(Number(body.total)).toBe(Number(a.inflow));
    });
  });

  // --- suspension ----------------------------------------------------------

  it('suspending one tenant does not touch the other', async () => {
    await unscoped.tenant.update({
      where: { id: b.tenantId },
      data: { status: 'SUSPENDED' },
    });

    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Cookie', b.cookies)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Cookie', a.cookies)
      .expect(200);

    await unscoped.tenant.update({
      where: { id: b.tenantId },
      data: { status: 'ACTIVE' },
    });
  });
});
