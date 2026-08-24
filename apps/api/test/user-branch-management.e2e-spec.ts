import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Phase 9 added `role`/`branchId` to `PATCH /users/:id`, so a caller can now
 * reassign a KASIR to a different branch or promote/demote a role without
 * hitting the request-body branchRule validation from `CreateUserSchema`
 * (that schema requires both fields together — a PATCH may send only one).
 * `UsersService.update` re-validates against the *merged* role/branchId
 * instead — these tests exist to prove that merge logic actually rejects the
 * invalid combinations it's meant to catch, not just the fields sent in the
 * same request.
 */
describe('User & branch management — role/branch reassignment (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let branchA: string;
  let branchB: string;

  const password = 'TestPass123!';
  const owner = { email: 'ubm-owner@test.local', cookies: [] as string[] };

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
      prisma.branch.create({ data: { name: 'UBM Branch A' } }),
      prisma.branch.create({ data: { name: 'UBM Branch B' } }),
    ]);
    branchA = a.id;
    branchB = b.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { name: 'Owner', email: owner.email, passwordHash, role: 'OWNER' },
    });

    owner.cookies = await login(owner.email);
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
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [owner.email, 'ubm-kasir@test.local', 'ubm-admin@test.local'],
        },
      },
    });
    await prisma.branch.deleteMany({
      where: { name: { in: ['UBM Branch A', 'UBM Branch B'] } },
    });
  }

  describe('reassigning a KASIR between branches', () => {
    let kasirId: string;

    beforeAll(async () => {
      const bcrypt = await import('bcrypt');
      const created = await prisma.user.create({
        data: {
          name: 'UBM Kasir',
          email: 'ubm-kasir@test.local',
          passwordHash: await bcrypt.hash(password, 10),
          role: 'KASIR',
          branchId: branchA,
        },
      });
      kasirId = created.id;
    });

    it('lets an OWNER move a KASIR to a different branch by sending only branchId', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${kasirId}`)
        .set('Cookie', owner.cookies)
        .send({ branchId: branchB })
        .expect(200);

      expect((res.body as { branchId: string }).branchId).toBe(branchB);
    });

    it('rejects un-assigning a KASIR from every branch (branchId: null) without changing role', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${kasirId}`)
        .set('Cookie', owner.cookies)
        .send({ branchId: null })
        .expect(400);

      const stillAssigned = await prisma.user.findUnique({
        where: { id: kasirId },
      });
      expect(stillAssigned?.branchId).not.toBeNull();
    });

    it('rejects promoting a KASIR to ADMIN without clearing branchId in the same request', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${kasirId}`)
        .set('Cookie', owner.cookies)
        .send({ role: 'ADMIN' })
        .expect(400);

      const stillKasir = await prisma.user.findUnique({
        where: { id: kasirId },
      });
      expect(stillKasir?.role).toBe('KASIR');
    });

    it('allows promoting a KASIR to ADMIN when branchId is cleared in the same request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${kasirId}`)
        .set('Cookie', owner.cookies)
        .send({ role: 'ADMIN', branchId: null })
        .expect(200);

      const body = res.body as { role: string; branchId: string | null };
      expect(body.role).toBe('ADMIN');
      expect(body.branchId).toBeNull();
    });

    it('rejects assigning a branch back to that now-ADMIN user without demoting them', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${kasirId}`)
        .set('Cookie', owner.cookies)
        .send({ branchId: branchA })
        .expect(400);
    });
  });

  describe('demoting an ADMIN to KASIR', () => {
    let adminId: string;

    beforeAll(async () => {
      const bcrypt = await import('bcrypt');
      const created = await prisma.user.create({
        data: {
          name: 'UBM Admin',
          email: 'ubm-admin@test.local',
          passwordHash: await bcrypt.hash(password, 10),
          role: 'ADMIN',
        },
      });
      adminId = created.id;
    });

    it('rejects demoting to KASIR without assigning a branch in the same request', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${adminId}`)
        .set('Cookie', owner.cookies)
        .send({ role: 'KASIR' })
        .expect(400);
    });

    it('allows demoting to KASIR when a branch is assigned in the same request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${adminId}`)
        .set('Cookie', owner.cookies)
        .send({ role: 'KASIR', branchId: branchA })
        .expect(200);

      const body = res.body as { role: string; branchId: string | null };
      expect(body.role).toBe('KASIR');
      expect(body.branchId).toBe(branchA);
    });
  });

  describe('branch existence check', () => {
    it('404s when reassigning a user to a branch that does not exist', async () => {
      const bcrypt = await import('bcrypt');
      const created = await prisma.user.create({
        data: {
          name: 'Temp Kasir',
          email: 'ubm-temp-kasir@test.local',
          passwordHash: await bcrypt.hash(password, 10),
          role: 'KASIR',
          branchId: branchA,
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${created.id}`)
        .set('Cookie', owner.cookies)
        .send({ branchId: '00000000-0000-4000-8000-00000000dead' })
        .expect(404);

      await prisma.user.delete({ where: { id: created.id } });
    });
  });
});
