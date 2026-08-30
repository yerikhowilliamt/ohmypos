import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantScopedPrisma } from './tenant-fixture';
import { resetDatabase } from './reset-database';

/**
 * Backend addendum to the frontend Reconciliation screen
 * (docs/plannings/phase-8h-reconciliation.md), approved as a scope expansion
 * beyond the original frontend-only plan (ADR-019 §1.6, and the plan's own
 * §2.4/§2.3 decisions):
 *
 * 1. `POST /matching/reject/:bankTransactionId` — a real per-candidate reject,
 *    scoping `resetMatches`'s UNRESOLVED-return behaviour to one transaction
 *    instead of every PENDING_REVIEW row for an account.
 * 2. `GET /ledger-entries?startDate&endDate` — the date-range bound the split-
 *    allocation candidate picker needs, since `LedgerEntryQuerySchema` had no
 *    date filter before this addendum.
 */
describe('Reconciliation backend addendum (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let accountId: string;
  let categoryId: string;
  let branchId: string;

  const adminEmail = 'recon-admin@test.local';
  const adminPassword = 'TestPass123!';
  let adminCookies: string[] = [];

  const kasirEmail = 'recon-kasir@test.local';
  const kasirPassword = 'TestPass123!';
  let kasirCookies: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new PostgresTriggerExceptionFilter());
    await app.init();

    prisma = await tenantScopedPrisma(app);
    await resetDatabase(prisma);

    const account = await prisma.account.create({
      data: { name: 'Recon Test Bank', type: 'BANK' },
    });
    const category = await prisma.category.create({
      data: { name: 'Recon Test Income', type: 'INFLOW' },
    });
    const branch = await prisma.branch.create({
      data: { name: 'Recon Test Branch' },
    });

    accountId = account.id;
    categoryId = category.id;
    branchId = branch.id;

    await prisma.user.create({
      data: {
        name: 'Recon Admin',
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: 'ADMIN',
        tokenValidFrom: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        name: 'Recon Kasir',
        email: kasirEmail,
        passwordHash: await bcrypt.hash(kasirPassword, 10),
        role: 'KASIR',
        branchId,
        tokenValidFrom: new Date(),
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminCookies = adminLogin.get('Set-Cookie') ?? [];

    const kasirLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: kasirEmail, password: kasirPassword })
      .expect(200);
    kasirCookies = kasirLogin.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await prisma.allocation.deleteMany({});
    await prisma.bankTransaction.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
  });

  describe('POST /matching/reject/:bankTransactionId', () => {
    it('returns a PENDING_REVIEW transaction to UNRESOLVED', async () => {
      const txn = await prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date('2026-02-01'),
          amount: '100.00',
          type: 'INFLOW',
          description: 'proposed match',
          status: 'PENDING_REVIEW',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/matching/reject/${txn.id}`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect((res.body as { status: string }).status).toBe('UNRESOLVED');

      const updated = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: txn.id },
      });
      expect(updated.status).toBe('UNRESOLVED');
    });

    it('404s for an unknown bank transaction id', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/matching/reject/00000000-0000-4000-8000-000000000000')
        .set('Cookie', adminCookies)
        .expect(404);
    });

    it('409s when the transaction is not PENDING_REVIEW', async () => {
      const txn = await prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date('2026-02-01'),
          amount: '100.00',
          type: 'INFLOW',
          description: 'not proposed',
          status: 'UNRESOLVED',
        },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/matching/reject/${txn.id}`)
        .set('Cookie', adminCookies)
        .expect(409);

      const unchanged = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: txn.id },
      });
      expect(unchanged.status).toBe('UNRESOLVED');
    });

    it('is forbidden for a KASIR (RoleGuard, ADR-011 §6)', async () => {
      const txn = await prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date('2026-02-01'),
          amount: '100.00',
          type: 'INFLOW',
          description: 'guarded',
          status: 'PENDING_REVIEW',
        },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/matching/reject/${txn.id}`)
        .set('Cookie', kasirCookies)
        .expect(403);
    });
  });

  describe('GET /ledger-entries date-range filter', () => {
    async function makeEntry(entryDate: string) {
      return prisma.ledgerEntry.create({
        data: {
          accountId,
          categoryId,
          branchId,
          entryDate: new Date(entryDate),
          amount: '50.00',
          type: 'INFLOW',
        },
      });
    }

    it('returns only entries within inclusive startDate/endDate bounds', async () => {
      const before = await makeEntry('2026-01-15');
      const inRangeStart = await makeEntry('2026-02-01');
      const inRangeEnd = await makeEntry('2026-02-10');
      const after = await makeEntry('2026-03-01');

      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .query({ startDate: '2026-02-01', endDate: '2026-02-10' })
        .set('Cookie', adminCookies)
        .expect(200);

      const ids = (res.body as { data: Array<{ id: string }> }).data.map(
        (row) => row.id,
      );
      expect(ids).toEqual(
        expect.arrayContaining([inRangeStart.id, inRangeEnd.id]),
      );
      expect(ids).not.toEqual(expect.arrayContaining([before.id, after.id]));
      expect(ids).toHaveLength(2);
    });

    it('applies startDate alone as a lower bound', async () => {
      await makeEntry('2026-01-01');
      const kept = await makeEntry('2026-02-15');

      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .query({ startDate: '2026-02-01' })
        .set('Cookie', adminCookies)
        .expect(200);

      const ids = (res.body as { data: Array<{ id: string }> }).data.map(
        (row) => row.id,
      );
      expect(ids).toEqual([kept.id]);
    });
  });

  /**
   * TASK-074 / DEBT-049. `LedgerEntryQuerySchema` accepted `sortBy` but the
   * service pinned the direction (`orderBy: { [sortBy ?? 'entryDate']: 'desc' }`),
   * so the Expenses table's sort headers could only ever produce a descending
   * list. These cases fail unless the direction actually reaches Prisma: the
   * asc and desc expectations are exact reverses of each other, so a hardcoded
   * direction breaks one of them whichever literal is chosen.
   *
   * The window is 2026-06, disjoint from the 2026-01…2026-03 dates the
   * date-range block above writes, so those rows cannot drift in here.
   */
  describe('GET /ledger-entries — sortOrder (TASK-074)', () => {
    const WINDOW = { startDate: '2026-06-01', endDate: '2026-06-30' };

    /**
     * Seeded per test, not in a `beforeAll`: the suite-level `beforeEach` above
     * truncates `ledgerEntry` before every case, so a once-only fixture would
     * be wiped before the first assertion ever runs.
     *
     * entryDate ascending (05 → 15 → 25) deliberately disagrees with amount
     * ascending (10 → 20 → 30 lands on 25 → 05 → 15), so `sortBy` and
     * `sortOrder` are observable independently of each other.
     */
    async function seed() {
      const make = async (entryDate: string, amount: string) =>
        prisma.ledgerEntry.create({
          data: {
            accountId,
            categoryId,
            branchId,
            entryDate: new Date(entryDate),
            amount,
            type: 'INFLOW',
          },
        });

      return {
        lowId: (await make('2026-06-25', '10.00')).id,
        midId: (await make('2026-06-05', '20.00')).id,
        highId: (await make('2026-06-15', '30.00')).id,
      };
    }

    async function list(query: Record<string, string>) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .query({ ...WINDOW, limit: '50', ...query })
        .set('Cookie', adminCookies)
        .expect(200);
      return (res.body as { data: Array<{ id: string; amount: string }> }).data;
    }

    it('sortBy=amount honours sortOrder in both directions', async () => {
      const { lowId, midId, highId } = await seed();

      const asc = await list({ sortBy: 'amount', sortOrder: 'asc' });
      expect(asc.map((row) => row.id)).toEqual([lowId, midId, highId]);

      const desc = await list({ sortBy: 'amount', sortOrder: 'desc' });
      expect(desc.map((row) => row.id)).toEqual([highId, midId, lowId]);
    });

    it('sortBy=entryDate honours sortOrder independently of amount', async () => {
      const { lowId, midId, highId } = await seed();

      const asc = await list({ sortBy: 'entryDate', sortOrder: 'asc' });
      expect(asc.map((row) => row.id)).toEqual([midId, highId, lowId]);
    });

    it('omitting sortOrder still defaults to desc', async () => {
      const { lowId, midId, highId } = await seed();

      const implicit = await list({ sortBy: 'entryDate' });
      const explicit = await list({ sortBy: 'entryDate', sortOrder: 'desc' });
      expect(implicit.map((row) => row.id)).toEqual(
        explicit.map((row) => row.id),
      );
      expect(implicit.map((row) => row.id)).toEqual([lowId, highId, midId]);
    });

    it('an unknown sortOrder is rejected, not coerced', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .query({ sortOrder: 'sideways' })
        .set('Cookie', adminCookies)
        .expect(400);
    });
  });

  /**
   * TASK-068. `sortOrder` never existed on this endpoint and the web client
   * hardcoded `sortBy: 'txnDate'` in `buildQuery`, so the table's three sort
   * headers reordered the visible page and never reached the API at all. These
   * cases pin the server side of that fix.
   */
  describe('GET /reconciliation/transactions — sorting', () => {
    async function makeTxn(date: string, amount: string, description: string) {
      return prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date(date),
          amount,
          type: 'INFLOW',
          description,
        },
      });
    }

    async function seedThree() {
      await makeTxn('2026-03-03', '300.00', 'Charlie setoran');
      await makeTxn('2026-03-01', '100.00', 'Alpha setoran');
      await makeTxn('2026-03-02', '200.00', 'Bravo setoran');
    }

    it('honours sortOrder in both directions', async () => {
      await seedThree();

      const asc = await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortBy: 'txnDate', sortOrder: 'asc' })
        .set('Cookie', adminCookies)
        .expect(200);

      const ascDates = (
        asc.body as { data: Array<{ txnDate: string }> }
      ).data.map((row) => new Date(row.txnDate).getTime());
      expect(ascDates).toHaveLength(3);
      for (let i = 1; i < ascDates.length; i += 1) {
        expect(ascDates[i]).toBeGreaterThanOrEqual(ascDates[i - 1]);
      }

      const desc = await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortBy: 'txnDate', sortOrder: 'desc' })
        .set('Cookie', adminCookies)
        .expect(200);

      const descFirst = (desc.body as { data: Array<{ description: string }> })
        .data[0]?.description;
      const ascFirst = (asc.body as { data: Array<{ description: string }> })
        .data[0]?.description;
      expect(descFirst).not.toBe(ascFirst);
    });

    it('sorts by amount as money, not as text', async () => {
      await seedThree();

      const res = await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortBy: 'amount', sortOrder: 'asc' })
        .set('Cookie', adminCookies)
        .expect(200);

      const amounts = (
        res.body as { data: Array<{ amount: string }> }
      ).data.map((row) => Number(row.amount));
      for (let i = 1; i < amounts.length; i += 1) {
        expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
      }
    });

    it('accepts description as a sort key', async () => {
      await seedThree();

      const res = await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortBy: 'description', sortOrder: 'asc' })
        .set('Cookie', adminCookies)
        .expect(200);

      const names = (
        res.body as { data: Array<{ description: string }> }
      ).data.map((row) => row.description);
      expect(names).toEqual([
        'Alpha setoran',
        'Bravo setoran',
        'Charlie setoran',
      ]);
    });

    it('rejects a sortBy that is a filter, not a sort key', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortBy: 'type' })
        .set('Cookie', adminCookies)
        .expect(400);
    });

    it('rejects an unknown sortOrder rather than coercing it', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortOrder: 'sideways' })
        .set('Cookie', adminCookies)
        .expect(400);
    });

    it('reports totalPages 1 for an empty result, not 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ status: 'MATCHED' })
        .set('Cookie', adminCookies)
        .expect(200);

      const meta = (res.body as { meta: { total: number; totalPages: number } })
        .meta;
      expect(meta.total).toBe(0);
      expect(meta.totalPages).toBe(1);
    });

    it('does not widen access — a KASIR still gets 403 (ADR-011 §6)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query({ sortBy: 'description', sortOrder: 'asc' })
        .set('Cookie', kasirCookies)
        .expect(403);
    });
  });

  /**
   * TASK-072 / DEBT-047. The search box on this table was a TanStack column
   * filter over the page on screen; it searched 50 rows while looking like it
   * searched the whole statement.
   *
   * The last case here is the important one. `ReconciliationQueryDto` serves
   * both this endpoint and /summary, and /summary derives
   * `variance = bank - ledger` from the same where-clause builder. A keyword
   * only matches a bank transaction's description, so if `search` reached the
   * shared builder the bank side would shrink while the ledger side stayed
   * whole — and `variance` would become a wrong number that still looks
   * official.
   */
  describe('GET /reconciliation/transactions — server-side search', () => {
    async function seedStatement() {
      await prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date('2026-04-01'),
          amount: '100.00',
          type: 'INFLOW',
          description: 'Alpha setoran tunai',
        },
      });
      await prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date('2026-04-02'),
          amount: '200.00',
          type: 'INFLOW',
          description: 'Bravo transfer masuk',
        },
      });
      await prisma.bankTransaction.create({
        data: {
          accountId,
          txnDate: new Date('2026-04-03'),
          amount: '300.00',
          type: 'INFLOW',
          description: 'Charlie transfer masuk',
        },
      });
      // The ledger side of the variance. Nothing about it is searchable.
      await prisma.ledgerEntry.create({
        data: {
          accountId,
          categoryId,
          branchId,
          entryDate: new Date('2026-04-02'),
          amount: '250.00',
          type: 'INFLOW',
        },
      });
    }

    async function search(query: Record<string, string>) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reconciliation/transactions')
        .query(query)
        .set('Cookie', adminCookies)
        .expect(200);
      return res.body as {
        data: Array<{ id: string; description: string }>;
        meta: { total: number; totalPages: number };
      };
    }

    it('matches the description, case-insensitively', async () => {
      await seedStatement();
      // Lowercase keyword against 'Alpha setoran tunai'. Removing
      // `mode: 'insensitive'` turns this red.
      const body = await search({ search: 'alpha' });
      expect(body.meta.total).toBe(1);
      expect(body.data[0].description).toBe('Alpha setoran tunai');
    });

    it('matches a substring in the middle, not just a prefix', async () => {
      await seedStatement();
      const body = await search({ search: 'transfer' });
      expect(body.meta.total).toBe(2);
    });

    it('finds a row the unfiltered FIRST PAGE does not contain', async () => {
      await seedStatement();
      // Default sort is txnDate desc, so a one-row page holds Charlie (3 Apr).
      const firstPage = await search({ limit: '1', page: '1' });
      expect(firstPage.data).toHaveLength(1);
      const firstPageIds = new Set(firstPage.data.map((row) => row.id));

      const searched = await search({ search: 'alpha', limit: '1', page: '1' });
      expect(searched.data).toHaveLength(1);
      expect(firstPageIds.has(searched.data[0].id)).toBe(false);
    });

    it('shrinks meta.total, not just the rows returned', async () => {
      await seedStatement();
      const body = await search({ search: 'alpha', limit: '50' });
      expect(body.meta.total).toBe(1);
      expect(body.meta.totalPages).toBe(1);
    });

    it('treats an empty search as no filter at all', async () => {
      await seedStatement();
      const body = await search({ search: '', limit: '50' });
      expect(body.meta.total).toBe(3);
    });

    it('ANDs with the status filter instead of replacing it', async () => {
      await seedStatement();
      const body = await search({ search: 'transfer', status: 'MATCHED' });
      expect(body.meta.total).toBe(0);
    });

    it('leaves the SUMMARY untouched — variance must not move', async () => {
      await seedStatement();

      async function summary(query: Record<string, string>) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/reconciliation/summary')
          .query(query)
          .set('Cookie', adminCookies)
          .expect(200);
        return res.body as {
          actualBankBalance: string;
          recordedLedgerBalance: string;
          variance: string;
        };
      }

      const plain = await summary({ accountId });
      // 600 bank inflow − 250 ledger inflow.
      expect(plain.actualBankBalance).toBe('600.00');
      expect(plain.recordedLedgerBalance).toBe('250.00');
      expect(plain.variance).toBe('350.00');

      // Same request, with a keyword that matches exactly one of the three
      // bank rows. If `search` reached buildWhereClause the bank side would
      // fall to 100.00 and variance to −150.00 — a confident, wrong number.
      const searched = await summary({ accountId, search: 'alpha' });
      expect(searched).toEqual(plain);
    });
  });
});
