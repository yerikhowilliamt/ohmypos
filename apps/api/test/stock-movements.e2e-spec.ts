// e2e tests run against the dedicated ohmypos_e2e database (see setup-e2e.ts).
import 'dotenv/config';
/**
 * OhMyPos — StockMovement read endpoint E2E (ERD §3, ADR-004, ADR-011,
 * ADR-018, TASK-070 plan §5.1).
 *
 * Fixtures are written straight through Prisma rather than through the real
 * sale/purchase endpoints, unlike inventory.e2e-spec.ts. That suite exists to
 * prove the WRITE path produces correct movements; this one tests the READ
 * path, and needs exact control over quantities, dates and null branches to
 * make the sort/filter assertions decisive.
 *
 * Every request is scoped to March 2024, a window no other suite touches, so
 * these assertions hold even when Jest runs suites in parallel against a shared
 * database.
 *
 * The fixture deliberately puts `movementDate` in MARCH and `createdAt` in
 * APRIL, in opposite orders. That is what makes the date-filter and default-sort
 * assertions able to tell the two columns apart — a service that filtered or
 * sorted `createdAt` would return zero rows for the March window instead of
 * quietly returning something plausible (plan §7 Trap 2).
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { StockMovementListResponse } from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

/** The whole fixture window. Every assertion below passes these two bounds. */
const WINDOW_START = '2024-03-01T00:00:00.000Z';
const WINDOW_END = '2024-03-31T23:59:59.999Z';
const WINDOW = `startDate=${WINDOW_START}&endDate=${WINDOW_END}`;

describe('StockMovements read endpoint (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPassword123!';
  const owner = { email: 'smv-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'smv-admin@test.local', cookies: [] as string[] };
  const kasir = { email: 'smv-kasir@test.local', cookies: [] as string[] };

  let branchId: string;
  let materialAId: string;

  interface Seed {
    material: 'A' | 'B' | 'C';
    day: number;
    direction: 'IN' | 'OUT';
    quantity: string;
    referenceType: 'SALE' | 'PURCHASE' | 'OPENING';
    branched: boolean;
  }

  // Quantities are all distinct so a sort assertion can name exactly one row.
  const SEEDS: Seed[] = [
    {
      material: 'A',
      day: 1,
      direction: 'IN',
      quantity: '10.0000',
      referenceType: 'OPENING',
      branched: false,
    },
    {
      material: 'B',
      day: 1,
      direction: 'IN',
      quantity: '11.0000',
      referenceType: 'OPENING',
      branched: false,
    },
    {
      material: 'C',
      day: 1,
      direction: 'IN',
      quantity: '12.0000',
      referenceType: 'OPENING',
      branched: false,
    },
    {
      material: 'A',
      day: 5,
      direction: 'IN',
      quantity: '5.0000',
      referenceType: 'PURCHASE',
      branched: true,
    },
    // A CENTRAL purchase — branchId null, exactly like a real one (ADR-004).
    {
      material: 'B',
      day: 6,
      direction: 'IN',
      quantity: '6.0000',
      referenceType: 'PURCHASE',
      branched: false,
    },
    {
      material: 'C',
      day: 7,
      direction: 'IN',
      quantity: '7.0000',
      referenceType: 'PURCHASE',
      branched: true,
    },
    {
      material: 'A',
      day: 10,
      direction: 'OUT',
      quantity: '1.0000',
      referenceType: 'SALE',
      branched: true,
    },
    {
      material: 'B',
      day: 11,
      direction: 'OUT',
      quantity: '2.0000',
      referenceType: 'SALE',
      branched: true,
    },
    {
      material: 'C',
      day: 12,
      direction: 'OUT',
      quantity: '3.0000',
      referenceType: 'SALE',
      branched: true,
    },
    {
      material: 'A',
      day: 20,
      direction: 'OUT',
      quantity: '4.0000',
      referenceType: 'SALE',
      branched: true,
    },
    {
      material: 'B',
      day: 21,
      direction: 'OUT',
      quantity: '8.0000',
      referenceType: 'SALE',
      branched: true,
    },
    {
      material: 'C',
      day: 22,
      direction: 'OUT',
      quantity: '9.0000',
      referenceType: 'SALE',
      branched: true,
    },
  ];

  const TOTAL = SEEDS.length; // 12

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
      data: { name: 'SMV Test Branch', address: 'Jl. Stock Movement No. 1' },
    });
    branchId = branch.id;

    const materialIds: Record<'A' | 'B' | 'C', string> = {
      A: (await createMaterial('SMV A-Kopi', 'kg')).id,
      B: (await createMaterial('SMV B-Gula', 'kg')).id,
      C: (await createMaterial('SMV C-Susu', 'liter')).id,
    };
    materialAId = materialIds.A;

    // createdAt runs in APRIL and in the REVERSE order of movementDate, so no
    // assertion below can pass by accident on the wrong column.
    for (const [index, seed] of SEEDS.entries()) {
      await prisma.stockMovement.create({
        data: {
          rawMaterialId: materialIds[seed.material],
          branchId: seed.branched ? branchId : null,
          direction: seed.direction,
          quantity: seed.quantity,
          referenceType: seed.referenceType,
          referenceId: `smv-ref-${index}`,
          unitCostAtMovement: `${Number(seed.quantity) * 1000}.00`,
          movementDate: new Date(
            `2024-03-${String(seed.day).padStart(2, '0')}T08:00:00.000Z`,
          ),
          createdAt: new Date(
            `2024-04-${String(TOTAL - index).padStart(2, '0')}T08:00:00.000Z`,
          ),
        },
      });
    }

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        { name: 'SMV Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'SMV Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'SMV Kasir',
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

  async function createMaterial(name: string, unit: string) {
    return prisma.rawMaterial.create({
      data: {
        name,
        unit,
        unitCost: '10000.00',
        currentStock: '0.0000',
        lowStockThreshold: '0.0000',
      },
    });
  }

  /** Every request goes through here, so the March window is never forgotten. */
  async function get(
    query: string,
    cookies: string[] = owner.cookies,
  ): Promise<StockMovementListResponse> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stock-movements?${WINDOW}&${query}`)
      .set('Cookie', cookies)
      .expect(200);
    return res.body as StockMovementListResponse;
  }

  async function cleanup() {
    await prisma.stockMovement.deleteMany({
      where: { rawMaterial: { name: { startsWith: 'SMV ' } } },
    });
    await prisma.rawMaterial.deleteMany({
      where: { name: { startsWith: 'SMV ' } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [owner.email, admin.email, kasir.email] } },
    });
    await prisma.branch.deleteMany({ where: { name: 'SMV Test Branch' } });
  }

  // ── 1. Access control (ADR-011) ─────────────────────────────────────────
  describe('access control', () => {
    it('allows OWNER', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stock-movements')
        .set('Cookie', owner.cookies)
        .expect(200);
    });

    it("denies ADMIN — stock history is not one of ADMIN's routes", async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stock-movements')
        .set('Cookie', admin.cookies)
        .expect(403);
    });

    it('denies KASIR', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stock-movements')
        .set('Cookie', kasir.cookies)
        .expect(403);
    });

    it('denies an unauthenticated caller', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stock-movements')
        .expect(401);
    });
  });

  // ── 2. Pagination ───────────────────────────────────────────────────────
  describe('pagination', () => {
    it('returns one page and honest meta', async () => {
      const body = await get('limit=5&page=1');
      expect(body.data).toHaveLength(5);
      expect(body.meta).toEqual({
        total: TOTAL,
        page: 1,
        limit: 5,
        totalPages: 3,
      });
    });

    it('page 2 is a DISJOINT set, not the same page again', async () => {
      // Asserted by id, not by length: a service that ignored `page` would
      // still return 5 rows and pass a count-only check.
      const first = await get('limit=5&page=1&sortBy=quantity&sortOrder=asc');
      const second = await get('limit=5&page=2&sortBy=quantity&sortOrder=asc');
      const firstIds = new Set(first.data.map((m) => m.id));
      const overlap = second.data.filter((m) => firstIds.has(m.id));
      expect(overlap).toHaveLength(0);
    });

    it('reports totalPages 1 for an empty result, never 0', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/stock-movements?startDate=2099-01-01T00:00:00.000Z&endDate=2099-12-31T00:00:00.000Z',
        )
        .set('Cookie', owner.cookies)
        .expect(200);
      const body = res.body as StockMovementListResponse;
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
      expect(body.meta.totalPages).toBe(1);
    });
  });

  // ── 3. Sorting ──────────────────────────────────────────────────────────
  describe('sorting', () => {
    it('honours sortOrder — asc and desc return DIFFERENT rows', async () => {
      // The TASK-067 defect class: a service that hardcodes 'desc' passes every
      // "is it sorted?" check while silently ignoring the parameter. Comparing
      // the two directions against each other is what catches it.
      const asc = await get('sortBy=quantity&sortOrder=asc&limit=1');
      const desc = await get('sortBy=quantity&sortOrder=desc&limit=1');
      expect(asc.data[0].quantity).toBe('1');
      expect(desc.data[0].quantity).toBe('12');
      expect(asc.data[0].id).not.toBe(desc.data[0].id);
    });

    it('sorts across the WHOLE set, not within a page', async () => {
      const page1 = await get('sortBy=quantity&sortOrder=asc&limit=3');
      expect(page1.data.map((m) => Number(m.quantity))).toEqual([1, 2, 3]);
    });

    it('sorts by rawMaterialName through the nested relation', async () => {
      const asc = await get('sortBy=rawMaterialName&sortOrder=asc&limit=12');
      const names = asc.data.map((m) => m.rawMaterialName);
      expect(names[0]).toBe('SMV A-Kopi');
      expect(names[names.length - 1]).toBe('SMV C-Susu');
      expect([...names]).toEqual([...names].sort());
    });

    it('defaults to movementDate desc — the business date, not createdAt', async () => {
      // createdAt runs in the OPPOSITE order in this fixture, so a service that
      // defaulted to createdAt would return day 1 first instead of day 22.
      const body = await get('limit=12');
      const days = body.data.map((m) => new Date(m.movementDate).getUTCDate());
      expect(days[0]).toBe(22);
      expect(days[days.length - 1]).toBe(1);
    });
  });

  // ── 4. Filters ──────────────────────────────────────────────────────────
  describe('filters', () => {
    it('filters by direction', async () => {
      const body = await get('direction=OUT&limit=50');
      expect(body.meta.total).toBe(6);
      expect(body.data.every((m) => m.direction === 'OUT')).toBe(true);
    });

    it('filters by referenceType', async () => {
      const body = await get('referenceType=OPENING&limit=50');
      expect(body.meta.total).toBe(3);
      expect(body.data.every((m) => m.referenceType === 'OPENING')).toBe(true);
    });

    it('filters by rawMaterialId', async () => {
      const body = await get(`rawMaterialId=${materialAId}&limit=50`);
      expect(body.meta.total).toBe(4);
      expect(body.data.every((m) => m.rawMaterialName === 'SMV A-Kopi')).toBe(
        true,
      );
    });

    it('filters by branchId as ATTRIBUTION — central rows are excluded', async () => {
      const body = await get(`branchId=${branchId}&limit=50`);
      // 12 seeds minus the 3 OPENING and the 1 central PURCHASE.
      expect(body.meta.total).toBe(8);
      expect(body.data.every((m) => m.branchId === branchId)).toBe(true);
    });

    it('filters the date range on movementDate, not createdAt', async () => {
      // Days 10–12 in March. Those rows were CREATED in April, so a service
      // filtering createdAt returns 0 here rather than 3.
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/stock-movements?startDate=2024-03-10T00:00:00.000Z&endDate=2024-03-12T23:59:59.999Z&limit=50',
        )
        .set('Cookie', owner.cookies)
        .expect(200);
      const body = res.body as StockMovementListResponse;
      expect(body.meta.total).toBe(3);
      expect(body.data.every((m) => m.referenceType === 'SALE')).toBe(true);
    });
  });

  // ── 5. Response shape ───────────────────────────────────────────────────
  describe('response shape', () => {
    it('keeps central rows, with branchName null', async () => {
      // 230 of the 594 movements in the dev database are central (OPENING or a
      // central purchase). A query that inner-joined branch would drop all of
      // them silently — the largest single category in the table.
      const body = await get('referenceType=OPENING&limit=50');
      expect(body.data).toHaveLength(3);
      expect(body.data.every((m) => m.branchId === null)).toBe(true);
      expect(body.data.every((m) => m.branchName === null)).toBe(true);
    });

    it('joins branchName for branch-attributed rows', async () => {
      const body = await get('referenceType=SALE&limit=50');
      expect(body.data.every((m) => m.branchName === 'SMV Test Branch')).toBe(
        true,
      );
    });

    it('joins rawMaterialName and rawMaterialUnit', async () => {
      const body = await get(`rawMaterialId=${materialAId}&limit=1`);
      expect(body.data[0].rawMaterialName).toBe('SMV A-Kopi');
      expect(body.data[0].rawMaterialUnit).toBe('kg');
    });

    it('returns decimals as strings, never as numbers', async () => {
      const body = await get('limit=1');
      expect(typeof body.data[0].quantity).toBe('string');
      expect(typeof body.data[0].unitCostAtMovement).toBe('string');
    });
  });

  // ── 5b. Server-side search (TASK-072, DEBT-047) ─────────────────────────
  describe('server-side search', () => {
    it('matches the raw material name, case-insensitively', async () => {
      // Lowercase keyword against 'SMV A-Kopi'. Drop `mode: 'insensitive'` from
      // the service and this is the assertion that goes red.
      const body = await get('search=a-kopi&limit=50');
      expect(body.meta.total).toBe(4);
      expect(body.data.every((m) => m.rawMaterialName === 'SMV A-Kopi')).toBe(
        true,
      );
    });

    it('finds a row the unfiltered FIRST PAGE does not contain', async () => {
      // The point of the whole task. A client-side filter over page 1 could
      // never return this row, so this is what separates server-side search
      // from the box that used to be here.
      const unfiltered = await get('limit=5&page=1');
      const firstPageIds = new Set(unfiltered.data.map((m) => m.id));
      expect(unfiltered.data).toHaveLength(5);

      const searched = await get('search=a-kopi&limit=5&page=1');
      const beyondFirstPage = searched.data.filter(
        (m) => !firstPageIds.has(m.id),
      );
      expect(beyondFirstPage.length).toBeGreaterThan(0);
    });

    it('shrinks meta.total, not just the rows returned', async () => {
      // `data.length` alone would pass on a service that filtered the page it
      // had already fetched. `total` comes from a separate count(where).
      const body = await get('search=a-kopi&limit=50');
      expect(body.meta.total).toBe(4);
      expect(body.meta.totalPages).toBe(1);
    });

    it('matches the branch name, and central rows correctly do not match', async () => {
      // Eight of the twelve fixtures carry a branch; the four central ones
      // (OPENING x3 + the central purchase) have no branch name to match.
      const body = await get('search=test branch&limit=50');
      expect(body.meta.total).toBe(8);
      expect(body.data.every((m) => m.branchId !== null)).toBe(true);
    });

    it('treats an empty search as no filter at all', async () => {
      const body = await get('search=&limit=50');
      expect(body.meta.total).toBe(TOTAL);
    });

    it('ANDs with the other filters instead of replacing them', async () => {
      // 'SMV A-Kopi' has four movements, two of them OUT. A service that let
      // the search overwrite `direction` would answer 4 here.
      const body = await get('search=a-kopi&direction=OUT&limit=50');
      expect(body.meta.total).toBe(2);
      expect(body.data.every((m) => m.direction === 'OUT')).toBe(true);
      expect(body.data.every((m) => m.rawMaterialName === 'SMV A-Kopi')).toBe(
        true,
      );
    });

    it('returns an empty page, not an error, for a keyword nothing matches', async () => {
      const body = await get('search=tidak-ada-bahan-ini&limit=50');
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
      expect(body.meta.totalPages).toBe(1);
    });
  });

  // ── 6. No write surface ─────────────────────────────────────────────────
  it('exposes no POST — movements are written only inside a transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/stock-movements')
      .set('Cookie', owner.cookies)
      .send({});
    expect(res.status).toBe(404);
  });
});
