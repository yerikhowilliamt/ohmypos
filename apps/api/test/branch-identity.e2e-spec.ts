import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantScopedPrisma } from './tenant-fixture';
import { resetDatabase } from './reset-database';

/**
 * Two identity flags on Branch, and the bugs they exist to close.
 *
 * `isSystem` replaced the row's NAME as the lookup key for the ADR-014
 * ledger-attribution row. Before that, renaming it broke no FK — so the rename
 * returned 200 and only the NEXT central purchase failed, with a 503 that named
 * nothing. The decisive test here is "a renamed system row still resolves":
 * it is the one that proves the name stopped carrying meaning.
 *
 * `isMainStore` is the Owner's first store, set automatically because the
 * request was "toko pertama otomatis pusatnya" — no switch, no onboarding gate.
 */
describe('Branch identity — system location & main store (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let systemBranchId: string;
  let accountId: string;
  let categoryId: string;

  const password = 'TestPass123!';
  const owner = { email: 'bid-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'bid-admin@test.local', cookies: [] as string[] };

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

    const system = await prisma.branch.create({
      data: { name: 'Umum', isSystem: true },
    });
    systemBranchId = system.id;

    const account = await prisma.account.create({
      data: { name: 'BID Kas', type: 'CASH' },
    });
    accountId = account.id;
    const category = await prisma.category.create({
      data: { name: 'BID Operasional', type: 'OUTFLOW' },
    });
    categoryId = category.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({
      data: [
        { name: 'Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'Admin', email: admin.email, passwordHash, role: 'ADMIN' },
      ],
    });

    owner.cookies = await login(owner.email);
    admin.cookies = await login(admin.email);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  /** Every store in these tests is created through the API, never through
   *  Prisma — the main-store rule lives in BranchesService and a direct
   *  `prisma.branch.create` would silently bypass it. */
  async function createStore(name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Cookie', owner.cookies)
      .send({ name })
      .expect(201);
    return res.body as { id: string; isSystem: boolean; isMainStore: boolean };
  }

  async function deleteStore(id: string) {
    await prisma.branch.delete({ where: { id } }).catch(() => undefined);
  }

  describe('the system location is protected', () => {
    it('refuses to rename it', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${systemBranchId}`)
        .set('Cookie', owner.cookies)
        .send({ name: 'Toko Pusat Kami' })
        .expect(409);

      const row = await prisma.branch.findUnique({
        where: { id: systemBranchId },
      });
      expect(row?.name).toBe('Umum');
    });

    it('refuses to delete it', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/branches/${systemBranchId}`)
        .set('Cookie', owner.cookies)
        .expect(409);

      const row = await prisma.branch.findUnique({
        where: { id: systemBranchId },
      });
      expect(row).not.toBeNull();
    });

    it('refuses to make it the main store', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${systemBranchId}/main-store`)
        .set('Cookie', owner.cookies)
        .expect(409);
    });

    it('still resolves a central entry after the row has been renamed', async () => {
      // The whole point of `isSystem`: the label is now free data. Renamed
      // directly in the database, bypassing the guard above, because what is
      // under test is the RESOLVER, not the guard.
      await prisma.branch.update({
        where: { id: systemBranchId },
        data: { name: 'Nama Yang Diganti Sembarangan' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger-entries')
        .set('Cookie', owner.cookies)
        .send({
          accountId,
          categoryId,
          branchId: null, // "central" — the backend resolves the system row
          entryDate: '2026-08-29T00:00:00.000Z',
          amount: '15000.00',
          type: 'OUTFLOW',
          note: 'Belanja umum',
        })
        .expect(201);

      const body = res.body as { branchId: string };
      expect(body.branchId).toBe(systemBranchId);

      await prisma.ledgerEntry.deleteMany({ where: { note: 'Belanja umum' } });
      await prisma.branch.update({
        where: { id: systemBranchId },
        data: { name: 'Umum' },
      });
    });
  });

  describe('the first store becomes the main store', () => {
    let first: { id: string };
    let second: { id: string };

    afterAll(async () => {
      await deleteStore(second.id);
      await deleteStore(first.id);
    });

    it('flags the first store and not the second', async () => {
      first = await createStore('BID Toko Pertama');
      second = await createStore('BID Toko Kedua');

      const firstRow = await prisma.branch.findUnique({
        where: { id: first.id },
      });
      const secondRow = await prisma.branch.findUnique({
        where: { id: second.id },
      });
      expect(firstRow?.isMainStore).toBe(true);
      expect(secondRow?.isMainStore).toBe(false);
    });

    it('does not count the system location as a candidate', async () => {
      const systemRow = await prisma.branch.findUnique({
        where: { id: systemBranchId },
      });
      expect(systemRow?.isMainStore).toBe(false);
    });

    it('ignores isSystem and isMainStore sent in the request body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Cookie', owner.cookies)
        .send({
          name: 'BID Toko Menyusup',
          isSystem: true,
          isMainStore: true,
        })
        .expect(201);
      const body = res.body as { id: string };

      const row = await prisma.branch.findUnique({ where: { id: body.id } });
      expect(row?.isSystem).toBe(false);
      // `first` already holds the designation; a request body cannot steal it.
      expect(row?.isMainStore).toBe(false);

      await deleteStore(body.id);
    });

    it('moves the designation, releasing the previous holder', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${second.id}/main-store`)
        .set('Cookie', owner.cookies)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', owner.cookies)
        .expect(200);
      const rows = res.body as { id: string; isMainStore: boolean }[];

      expect(rows.filter((r) => r.isMainStore)).toHaveLength(1);
      expect(rows.find((r) => r.id === second.id)?.isMainStore).toBe(true);
      expect(rows.find((r) => r.id === first.id)?.isMainStore).toBe(false);

      // Put it back so the deletion tests below start from a known holder.
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${first.id}/main-store`)
        .set('Cookie', owner.cookies)
        .expect(200);
    });

    it('refuses to delete the main store while other stores remain', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/branches/${first.id}`)
        .set('Cookie', owner.cookies)
        .expect(409);
    });

    it('allows deleting the main store when it is the only one left', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/branches/${second.id}`)
        .set('Cookie', owner.cookies)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/branches/${first.id}`)
        .set('Cookie', owner.cookies)
        .expect(200);
    });
  });

  describe('who may move the designation', () => {
    let store: { id: string };

    beforeAll(async () => {
      store = await createStore('BID Toko RBAC');
    });

    afterAll(async () => {
      await deleteStore(store.id);
    });

    it('rejects an ADMIN with 403', async () => {
      // The class-level guard allows ADMIN; the method-level @Roles('OWNER')
      // must narrow it. Asserted rather than assumed.
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${store.id}/main-store`)
        .set('Cookie', admin.cookies)
        .expect(403);
    });

    it('accepts the OWNER', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${store.id}/main-store`)
        .set('Cookie', owner.cookies)
        .expect(200);
    });
  });
});
