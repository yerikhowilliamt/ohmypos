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

    prisma = app.get(PrismaService);
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
});
