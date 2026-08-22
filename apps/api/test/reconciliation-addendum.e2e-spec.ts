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
});
