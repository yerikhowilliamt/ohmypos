import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type { PaymentMethodResponse } from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * RoleGuard, BranchScopeGuard and the JWT lifecycle are all in Playbook §10's
 * "must have thorough tests" tier — they are the only thing standing between a
 * cashier and another branch's money.
 *
 * Every assertion here goes through real HTTP with real cookies. A unit test of
 * the guard classes would pass even if they were never wired to a controller,
 * which is precisely the failure mode worth catching.
 */
describe('Auth & role-based access control (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let branchA: string;
  let branchB: string;
  let centralBranchId: string;
  let accountId: string;
  let categoryId: string;

  const password = 'TestPass123!';
  const owner = { email: 'rbac-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'rbac-admin@test.local', cookies: [] as string[] };
  const kasir = { email: 'rbac-kasir@test.local', cookies: [] as string[] };

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

    const [a, b] = await Promise.all([
      prisma.branch.create({ data: { name: 'RBAC Branch A' } }),
      prisma.branch.create({ data: { name: 'RBAC Branch B' } }),
    ]);
    branchA = a.id;
    branchB = b.id;
    const centralBranch = await prisma.branch.upsert({
      where: { name: 'Umum' },
      create: { name: 'Umum', isSystem: true },
      update: {},
    });
    centralBranchId = centralBranch.id;

    const account = await prisma.account.create({
      data: { name: 'RBAC Account', type: 'BANK' },
    });
    const category = await prisma.category.create({
      data: { name: 'RBAC Category', type: 'INFLOW' },
    });
    accountId = account.id;
    categoryId = category.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        { name: 'Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'Kasir',
          email: kasir.email,
          passwordHash,
          role: 'KASIR',
          branchId: branchA,
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

  async function cleanup() {
    await prisma.allocation.deleteMany({});
    await prisma.bankTransaction.deleteMany({});
    // Phase 4's purchasing rows must go first. `SupplierPurchase.ledgerEntry`
    // and `PayableSettlement.ledgerEntry` are `onDelete: Restrict` on purpose
    // (plan §8.4d — financial history must never vanish because a parent row
    // was deleted), so the wipe below hits
    // `supplier_purchases_ledger_entry_id_fkey` on any database that has been
    // seeded. Order, not scope, is what fixes it.
    await prisma.payableSettlement.deleteMany({});
    await prisma.payable.deleteMany({});
    await prisma.supplierPurchaseItem.deleteMany({});
    await prisma.supplierPurchase.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    // Phase 5's Sale.ledgerEntryId is `onDelete: Restrict` too (plan §9.1) —
    // saleItem/sale must go before the ledgerEntry wipe below, same reasoning
    // as the purchasing rows above (ERR-004's lesson, again).
    await prisma.saleItem.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
    // Includes the users individual tests create, so a failed run leaves
    // nothing behind that would break the next one.
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            owner.email,
            admin.email,
            kasir.email,
            'created-kasir@test.local',
            'deactivate-me@test.local',
            'bad-kasir@test.local',
            'bad-admin@test.local',
          ],
        },
      },
    });
    await prisma.branch.deleteMany({
      where: { name: { in: ['RBAC Branch A', 'RBAC Branch B'] } },
    });
    await prisma.account.deleteMany({ where: { name: 'RBAC Account' } });
    await prisma.category.deleteMany({ where: { name: 'RBAC Category' } });
  }

  describe('authentication', () => {
    it('rejects an unauthenticated request to a protected endpoint', async () => {
      await request(app.getHttpServer()).get('/api/v1/accounts').expect(401);
    });

    it('rejects wrong credentials without revealing whether the account exists', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'nope' })
        .expect(401);
      const noSuchUser = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@test.local', password: 'nope' })
        .expect(401);

      expect((wrongPassword.body as { message: string }).message).toBe(
        (noSuchUser.body as { message: string }).message,
      );
    });

    it('issues HttpOnly cookies rather than tokens in the body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password })
        .expect(200);

      const cookies = res.get('Set-Cookie') ?? [];
      expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
      expect(cookies.every((c) => c.includes('HttpOnly'))).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // no JWT in the body
    });

    it('returns the caller identity from /auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', kasir.cookies)
        .expect(200);

      const body = res.body as { role: string; branchId: string };
      expect(body.role).toBe('KASIR');
      expect(body.branchId).toBe(branchA);
    });
  });

  describe('RoleGuard — user creation is OWNER only (ADR-011 §5)', () => {
    it('lets an OWNER create a KASIR', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', owner.cookies)
        .send({
          name: 'New Kasir',
          email: 'created-kasir@test.local',
          password: 'AnotherPass123!',
          role: 'KASIR',
          branchId: branchB,
        })
        .expect(201);

      await prisma.user.deleteMany({
        where: { email: 'created-kasir@test.local' },
      });
    });

    it('rejects an ADMIN creating a user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', admin.cookies)
        .send({
          name: 'X',
          email: 'x@test.local',
          password: 'AnotherPass123!',
          role: 'ADMIN',
        })
        .expect(403);
    });

    it('rejects a KASIR creating a user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', kasir.cookies)
        .send({
          name: 'X',
          email: 'x2@test.local',
          password: 'AnotherPass123!',
          role: 'KASIR',
          branchId: branchA,
        })
        .expect(403);
    });

    it('rejects a KASIR listing users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', kasir.cookies)
        .expect(403);
    });
  });

  describe('RoleGuard — reconciliation is ADMIN/OWNER only (ADR-011 §6)', () => {
    it('rejects a KASIR creating an allocation', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/allocations')
        .set('Cookie', kasir.cookies)
        .send({
          bankTransactionId: '00000000-0000-4000-8000-00000000aaaa',
          ledgerEntryId: '00000000-0000-4000-8000-00000000bbbb',
          amountPortion: '1.00',
        })
        .expect(403);
    });

    it('lets an ADMIN through to the allocation endpoint', async () => {
      // 404, not 403 — the guard passed and the service rejected the unknown id.
      await request(app.getHttpServer())
        .post('/api/v1/allocations')
        .set('Cookie', admin.cookies)
        .send({
          bankTransactionId: '00000000-0000-4000-8000-00000000aaaa',
          ledgerEntryId: '00000000-0000-4000-8000-00000000bbbb',
          amountPortion: '1.00',
        })
        .expect(404);
    });

    it('rejects a KASIR reading allocations', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/allocations/transaction/00000000-0000-4000-8000-00000000aaaa',
        )
        .set('Cookie', kasir.cookies)
        .expect(403);
    });
  });

  describe('BranchScopeGuard (ADR-011 §4)', () => {
    it('rejects a KASIR writing a ledger entry for another branch', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', kasir.cookies)
        .send({
          accountId,
          categoryId,
          branchId: branchB,
          entryDate: '2026-03-01',
          amount: '10.00',
          type: 'INFLOW',
        })
        .expect(403);
    });

    it('allows a KASIR writing a ledger entry for their own branch', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', kasir.cookies)
        .send({
          accountId,
          categoryId,
          branchId: branchA,
          entryDate: '2026-03-01',
          amount: '10.00',
          type: 'INFLOW',
        })
        .expect(201);
    });

    it('rejects a KASIR writing a central ledger entry', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', kasir.cookies)
        .send({
          accountId,
          categoryId,
          branchId: null,
          entryDate: '2026-03-01',
          amount: '10.00',
          type: 'INFLOW',
        })
        .expect(403);
    });

    it.each([
      ['ADMIN', () => admin.cookies],
      ['OWNER', () => owner.cookies],
    ])(
      'maps a null branchId from %s to the central system branch',
      async (_role, getCookies) => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/ledger-entries')
          .set('Cookie', getCookies())
          .send({
            accountId,
            categoryId,
            branchId: null,
            entryDate: '2026-03-01',
            amount: '10.00',
            type: 'INFLOW',
          })
          .expect(201);

        expect((res.body as { branchId: string }).branchId).toBe(
          centralBranchId,
        );
      },
    );

    it('lets an OWNER move a manual entry from a branch to the center', async () => {
      const entry = await prisma.ledgerEntry.create({
        data: {
          accountId,
          categoryId,
          branchId: branchA,
          entryDate: new Date('2026-03-01'),
          amount: '10.00',
          type: 'INFLOW',
          sourceType: 'MANUAL',
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ledger-entries/${entry.id}`)
        .set('Cookie', owner.cookies)
        .send({ branchId: null })
        .expect(200);

      expect((res.body as { branchId: string }).branchId).toBe(centralBranchId);
    });

    it('rejects a KASIR reading another branch explicitly', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/ledger-entries?branchId=${branchB}`)
        .set('Cookie', kasir.cookies)
        .expect(403);
    });

    it('rejects a KASIR list request that does not state a branch', async () => {
      // Fail closed rather than silently scoping: see BranchScopeGuard for why
      // injecting the branch here is not viable on Express 5.
      await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .set('Cookie', kasir.cookies)
        .expect(403);
    });

    it('returns only their own branch when a KASIR states it', async () => {
      await prisma.ledgerEntry.create({
        data: {
          accountId,
          categoryId,
          branchId: branchB,
          entryDate: new Date('2026-03-02'),
          amount: '99.00',
          type: 'INFLOW',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/ledger-entries?branchId=${branchA}`)
        .set('Cookie', kasir.cookies)
        .expect(200);

      const body = res.body as { data: Array<{ branchId: string }> };
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((e) => e.branchId === branchA)).toBe(true);
    });

    it('lets an ADMIN read across branches unscoped', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .set('Cookie', admin.cookies)
        .expect(200);

      const body = res.body as { data: Array<{ branchId: string }> };
      const branches = new Set(body.data.map((e) => e.branchId));
      expect(branches.size).toBeGreaterThan(1);
    });

    it('lets an OWNER read across branches unscoped', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/ledger-entries')
        .set('Cookie', owner.cookies)
        .expect(200);
    });
  });

  describe('ledger-entries/:id access control (DEF-QA-01)', () => {
    let branchAEntryId: string;
    let branchBEntryId: string;

    beforeAll(async () => {
      const [entryA, entryB] = await Promise.all([
        prisma.ledgerEntry.create({
          data: {
            accountId,
            categoryId,
            branchId: branchA,
            entryDate: new Date('2026-03-03'),
            amount: '15.00',
            type: 'INFLOW',
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            accountId,
            categoryId,
            branchId: branchB,
            entryDate: new Date('2026-03-03'),
            amount: '25.00',
            type: 'INFLOW',
          },
        }),
      ]);
      branchAEntryId = entryA.id;
      branchBEntryId = entryB.id;
    });

    it('lets a KASIR read a ledger entry from their own branch', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/ledger-entries/${branchAEntryId}`)
        .set('Cookie', kasir.cookies)
        .expect(200);
    });

    it('rejects a KASIR reading a ledger entry from another branch (IDOR)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/ledger-entries/${branchBEntryId}`)
        .set('Cookie', kasir.cookies)
        .expect(403);
    });

    it('rejects a KASIR updating any ledger entry, even their own branch', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/ledger-entries/${branchAEntryId}`)
        .set('Cookie', kasir.cookies)
        .send({ amount: '999.00' })
        .expect(403);
    });

    it('rejects a KASIR deleting any ledger entry', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/ledger-entries/${branchAEntryId}`)
        .set('Cookie', kasir.cookies)
        .expect(403);
    });

    it('lets an ADMIN update a ledger entry from any branch', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/ledger-entries/${branchBEntryId}`)
        .set('Cookie', admin.cookies)
        .send({ amount: '30.00' })
        .expect(200);
    });

    it('lets an OWNER delete a ledger entry from any branch', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/ledger-entries/${branchBEntryId}`)
        .set('Cookie', owner.cookies)
        .expect(200);
    });
  });

  describe('role/branch consistency (ADR-011 §2)', () => {
    it('rejects creating a KASIR without a branch', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', owner.cookies)
        .send({
          name: 'Bad Kasir',
          email: 'bad-kasir@test.local',
          password: 'AnotherPass123!',
          role: 'KASIR',
        })
        .expect(400);
    });

    it('rejects creating an ADMIN with a branch', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', owner.cookies)
        .send({
          name: 'Bad Admin',
          email: 'bad-admin@test.local',
          password: 'AnotherPass123!',
          role: 'ADMIN',
          branchId: branchA,
        })
        .expect(400);
    });
  });

  describe('JWT refresh and revocation (ADR-011 §3)', () => {
    it('rotates tokens on refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', admin.cookies)
        .expect(200);

      const rotated = res.get('Set-Cookie') ?? [];
      expect(rotated.some((c) => c.startsWith('access_token='))).toBe(true);
      admin.cookies = rotated;
    });

    it('revokes the session on logout, so the old cookie stops working', async () => {
      const cookies = await login(admin.email);

      // JWT `iat` has one-second resolution, so revocation is precise to the
      // second — see the note in JwtAuthGuard. Crossing the boundary is what
      // makes this assertion meaningful rather than timing-dependent.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookies)
        .expect(401);

      admin.cookies = await login(admin.email);
    });

    it('locks out a deactivated user immediately, mid-session', async () => {
      const victimEmail = 'deactivate-me@test.local';
      const bcrypt = await import('bcrypt');
      const created = await prisma.user.create({
        data: {
          name: 'Temp',
          email: victimEmail,
          passwordHash: await bcrypt.hash(password, 10),
          role: 'ADMIN',
        },
      });

      const cookies = await login(victimEmail);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${created.id}/deactivate`)
        .set('Cookie', owner.cookies)
        .expect(200);

      // The token is still cryptographically valid — it must be rejected anyway.
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookies)
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: victimEmail, password })
        .expect(401);

      await prisma.user.delete({ where: { id: created.id } });
    });
  });

  describe('Full Route Authorization Matrix (DEF-001 & P0-1)', () => {
    it('rejects KASIR on master data and reconciliation endpoints (403)', async () => {
      const endpoints: Array<{
        method: 'get' | 'post' | 'patch' | 'delete';
        url: string;
        body?: object;
      }> = [
        {
          method: 'post',
          url: '/api/v1/branches',
          body: { name: 'Pwn Branch' },
        },
        { method: 'get', url: '/api/v1/branches' },
        {
          method: 'patch',
          url: `/api/v1/branches/${branchA}`,
          body: { name: 'Updated' },
        },
        { method: 'delete', url: `/api/v1/branches/${branchA}` },
        {
          method: 'post',
          url: '/api/v1/accounts',
          body: { name: 'Pwn Account', type: 'BANK' },
        },
        { method: 'get', url: '/api/v1/accounts' },
        {
          method: 'post',
          url: '/api/v1/categories',
          body: { name: 'Pwn Cat', type: 'INFLOW' },
        },
        { method: 'get', url: '/api/v1/categories' },
        {
          method: 'post',
          url: '/api/v1/matching/propose',
          body: { accountId },
        },
        { method: 'post', url: '/api/v1/matching/reset', body: { accountId } },
        { method: 'get', url: '/api/v1/reconciliation/transactions' },
        { method: 'get', url: '/api/v1/reconciliation/summary' },
        { method: 'post', url: `/api/v1/import/csv/${accountId}?format=BCA` },
        {
          method: 'post',
          url: `/api/v1/import/pdf/${accountId}?format=MANDIRI_PDF`,
        },
      ];

      for (const ep of endpoints) {
        const req = request(app.getHttpServer())
          [ep.method](ep.url)
          .set('Cookie', kasir.cookies);
        if (ep.body) {
          req.send(ep.body);
        }
        const res = await req;
        expect(res.status).toBe(403);
      }
    });

    it('allows KASIR on GET /accounts/payment-methods, without exposing balances', async () => {
      // The POS needs an accountId to satisfy CreateSaleSchema, but Kas Awal is
      // owner-level financial data. The narrowed projection is the whole point of
      // this route existing separately from GET /accounts.
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounts/payment-methods')
        .set('Cookie', kasir.cookies)
        .expect(200);

      const accounts = res.body as PaymentMethodResponse[];
      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);
      for (const account of accounts) {
        expect(Object.keys(account).sort()).toEqual(['id', 'name', 'type']);
        expect(account).not.toHaveProperty('openingBalance');
      }
    });

    it('keeps the rest of /accounts closed to KASIR', async () => {
      // The literal segment must not fall through to @Get(':id') either — that
      // would surface as a 400 from ParseUUIDPipe rather than a working route.
      await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Cookie', kasir.cookies)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Cookie', kasir.cookies)
        .expect(403);
    });

    it('allows ADMIN and OWNER on master data and reconciliation endpoints', async () => {
      // Branches GET
      await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', admin.cookies)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', owner.cookies)
        .expect(200);

      // Accounts GET
      await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Cookie', admin.cookies)
        .expect(200);

      // Categories GET
      await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Cookie', admin.cookies)
        .expect(200);

      // Reconciliation Summary GET
      await request(app.getHttpServer())
        .get('/api/v1/reconciliation/summary')
        .set('Cookie', admin.cookies)
        .expect(200);
    });

    it('rejects unauthenticated callers on protected endpoints (401)', async () => {
      const endpoints: Array<{ method: 'get' | 'post'; url: string }> = [
        { method: 'get', url: '/api/v1/branches' },
        { method: 'get', url: '/api/v1/accounts' },
        { method: 'get', url: '/api/v1/categories' },
        { method: 'post', url: '/api/v1/matching/propose' },
        { method: 'get', url: '/api/v1/reconciliation/summary' },
        { method: 'get', url: '/api/v1/users' },
        { method: 'get', url: '/api/v1/reports/profit-loss' },
      ];

      for (const ep of endpoints) {
        await request(app.getHttpServer())[ep.method](ep.url).expect(401);
      }
    });
  });

  describe('Branch Deletion with Dependent Staff (DEF-002 & P0-2)', () => {
    it('rejects deleting a branch with assigned staff (400) and preserves cashier branchId', async () => {
      // 1. Create a dedicated branch
      const branchRes = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Cookie', owner.cookies)
        .send({ name: 'Branch To Delete' })
        .expect(201);
      const branchBody = branchRes.body as { id: string };
      const testBranchId = branchBody.id;

      // 2. Create a cashier assigned to this branch
      const userRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', owner.cookies)
        .send({
          name: 'Staff at Branch',
          email: 'staff-del@test.local',
          password: 'Password123!',
          role: 'KASIR',
          branchId: testBranchId,
        })
        .expect(201);
      const userBody = userRes.body as { id: string };
      const testUserId = userBody.id;

      // 3. Attempt to delete the branch -> MUST return 400 with descriptive error naming staff
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/branches/${testBranchId}`)
        .set('Cookie', owner.cookies)
        .expect(400);

      const delBody = delRes.body as { message: string };
      expect(delBody.message).toContain('Staff at Branch');

      // 4. Assert user's branchId is still intact and not null
      const checkUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(checkUser?.branchId).toBe(testBranchId);

      // Cleanup
      await prisma.user.delete({ where: { id: testUserId } });
      await prisma.branch.delete({ where: { id: testBranchId } });
    });
  });

  describe('List Endpoint Parameter Validation & Fuzzing (DEF-007 & P1-1)', () => {
    it('rejects unvalidated sortBy parameters on all list endpoints (400)', async () => {
      const endpoints = [
        '/api/v1/sales',
        '/api/v1/payables',
        '/api/v1/suppliers',
        '/api/v1/ledger-entries',
        '/api/v1/supplier-purchases',
      ];

      const badSorts = ['nonexistentField', 'user', '', '__proto__'];

      for (const url of endpoints) {
        for (const badSort of badSorts) {
          const res = await request(app.getHttpServer())
            .get(`${url}?sortBy=${encodeURIComponent(badSort)}`)
            .set('Cookie', owner.cookies);

          expect(res.status).toBe(400);
        }

        // Check bad page/limit parameters
        const page0 = await request(app.getHttpServer())
          .get(`${url}?page=0`)
          .set('Cookie', owner.cookies);
        expect(page0.status).toBe(400);

        const limit101 = await request(app.getHttpServer())
          .get(`${url}?limit=101`)
          .set('Cookie', owner.cookies);
        expect(limit101.status).toBe(400);
      }
    });
  });

  describe('Sale Date Boundaries (DEF-008 & P1-2)', () => {
    it('rejects sales dated in the distant future or distant past (400)', async () => {
      // Product for sale test
      const product = await prisma.product.create({
        data: { name: 'Rbac Product', sellPrice: '10000.00' },
      });

      // 1. Far future sale (2126-01-01)
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', kasir.cookies)
        .send({
          branchId: branchA,
          accountId,
          soldAt: '2126-01-01T00:00:00.000Z',
          items: [{ productId: product.id, quantity: '1.0000' }],
        })
        .expect(400);

      // 2. Far past sale (2020-01-01)
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Cookie', kasir.cookies)
        .send({
          branchId: branchA,
          accountId,
          soldAt: '2020-01-01T00:00:00.000Z',
          items: [{ productId: product.id, quantity: '1.0000' }],
        })
        .expect(400);

      await prisma.product.delete({ where: { id: product.id } });
    });
  });
});
