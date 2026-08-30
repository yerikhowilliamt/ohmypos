import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantScopedPrisma } from './tenant-fixture';

/**
 * Phase 10a adds three self-service auth endpoints: PATCH /auth/me (name),
 * the last-active-OWNER guard on PATCH /auth/deactivate, and confirms an
 * ordinary (non-last-OWNER) self-deactivation actually ends the session.
 */
describe('Profile self-service (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPass123!';
  const soleOwner = {
    email: 'pss-sole-owner@test.local',
    cookies: [] as string[],
  };
  const ownerA = { email: 'pss-owner-a@test.local', cookies: [] as string[] };
  const ownerB = { email: 'pss-owner-b@test.local', cookies: [] as string[] };
  const kasir = { email: 'pss-kasir@test.local', cookies: [] as string[] };
  let branchId: string;
  let otherActiveOwnerIds: string[] = [];

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
    await cleanup();

    const branch = await prisma.branch.create({ data: { name: 'PSS Branch' } });
    branchId = branch.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({
      data: [
        {
          name: 'Sole Owner',
          email: soleOwner.email,
          passwordHash,
          role: 'OWNER',
        },
        { name: 'Owner A', email: ownerA.email, passwordHash, role: 'OWNER' },
        { name: 'Owner B', email: ownerB.email, passwordHash, role: 'OWNER' },
        {
          name: 'Kasir',
          email: kasir.email,
          passwordHash,
          role: 'KASIR',
          branchId,
        },
      ],
    });

    otherActiveOwnerIds = (
      await prisma.user.findMany({
        where: {
          role: 'OWNER',
          isActive: true,
          email: { notIn: [soleOwner.email, ownerA.email, ownerB.email] },
        },
        select: { id: true },
      })
    ).map((u) => u.id);
    if (otherActiveOwnerIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: otherActiveOwnerIds } },
        data: { isActive: false },
      });
    }

    soleOwner.cookies = await login(soleOwner.email);
    ownerA.cookies = await login(ownerA.email);
    ownerB.cookies = await login(ownerB.email);
    kasir.cookies = await login(kasir.email);
  });

  afterAll(async () => {
    if (otherActiveOwnerIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: otherActiveOwnerIds } },
        data: { isActive: true },
      });
    }
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
          in: [soleOwner.email, ownerA.email, ownerB.email, kasir.email],
        },
      },
    });
    await prisma.branch.deleteMany({ where: { name: 'PSS Branch' } });
  }

  describe('PATCH /auth/me', () => {
    it('lets a KASIR change their own display name', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/auth/me')
        .set('Cookie', kasir.cookies)
        .send({ name: 'Kasir Renamed' })
        .expect(200);

      expect((res.body as { name: string }).name).toBe('Kasir Renamed');
    });

    it('rejects an empty name', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/me')
        .set('Cookie', kasir.cookies)
        .send({ name: '' })
        .expect(400);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/me')
        .send({ name: 'Nobody' })
        .expect(401);
    });
  });

  describe('PATCH /auth/deactivate', () => {
    it('ends the session immediately — a subsequent request with the old cookie is unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', ownerB.cookies)
        .expect(200);

      await request(app.getHttpServer())
        .patch('/api/v1/auth/deactivate')
        .set('Cookie', ownerB.cookies)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', ownerB.cookies)
        .expect(401);
    });

    it('lets an OWNER deactivate themselves when another active OWNER exists', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/deactivate')
        .set('Cookie', ownerA.cookies)
        .expect(200);

      const deactivated = await prisma.user.findUnique({
        where: { email: ownerA.email },
      });
      expect(deactivated?.isActive).toBe(false);
      expect(deactivated?.refreshTokenHash).toBeNull();
    });

    // Must run last: the guard counts ALL active OWNER rows in the table, so
    // the soleOwner fixture is only truly the last active OWNER after ownerA
    // and ownerB have deactivated themselves in the preceding tests.
    it('rejects the last active OWNER deactivating themselves', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/deactivate')
        .set('Cookie', soleOwner.cookies)
        .expect(400);

      const stillActive = await prisma.user.findUnique({
        where: { email: soleOwner.email },
      });
      expect(stillActive?.isActive).toBe(true);
    });
  });
});
