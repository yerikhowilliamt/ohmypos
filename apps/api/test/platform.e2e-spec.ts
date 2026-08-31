import { INestApplication, RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
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
import { PlatformModule } from '../src/modules/platform/platform.module';
import { tenantFixture } from './tenant-fixture';
import { resetDatabase } from './reset-database';

/**
 * ADR-025 Fase 4 — the platform console.
 *
 * The first describe block is the one that matters most. Platform controllers
 * must be `@Public()` to get past the global `JwtAuthGuard`, so authentication
 * is opt-in for exactly the routes that reach every tenant in the system
 * (DEBT-066). Rather than list those routes by hand — a list that goes stale
 * the moment someone adds a route, which is the failure being guarded against —
 * they are enumerated from `PlatformModule`'s own `controllers` metadata. A
 * controller has to be registered there to be routed at all, so the enumeration
 * cannot miss one.
 */
describe('Platform console (e2e)', () => {
  let app: INestApplication<App>;
  let unscoped: UnscopedPrismaService;
  let e2ePrisma: PrismaService;
  let e2eTenantId: string;

  const PLATFORM_PASSWORD = 'platform-password-1234';
  const TENANT_PASSWORD = 'TenantPass123!';

  const mainAdmin = {
    email: 'plat-main@ohmypos.local',
    cookies: [] as string[],
  };
  const spareAdmin = { email: 'plat-spare@ohmypos.local' };
  const tenantOwner = { email: 'plat-tenant-owner@test.local' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new PostgresTriggerExceptionFilter());
    await app.init();

    const fixture = await tenantFixture(app);
    unscoped = fixture.unscoped;
    e2ePrisma = fixture.prisma;
    e2eTenantId = fixture.tenantId;

    // Unscoped, so it also clears any tenant a previous run provisioned.
    await resetDatabase(unscoped);
    await deleteProvisionedTenants();

    const passwordHash = await bcrypt.hash(PLATFORM_PASSWORD, 10);
    await unscoped.platformAdmin.createMany({
      data: [
        { name: 'Main Ops', email: mainAdmin.email, passwordHash },
        { name: 'Spare Ops', email: spareAdmin.email, passwordHash },
      ],
    });

    // The e2e tenant gets a system branch of its own before any tenant is
    // provisioned through the API. Without this the provisioning test would run
    // against a database where no `isSystem` row exists yet — which is not the
    // case a real platform is ever in, and is exactly the gap that hid ERR-044
    // (the `branches_single_system` index was global, so the SECOND tenant on
    // any database could not be created at all).
    await e2ePrisma.branch.create({ data: { name: 'Umum', isSystem: true } });

    // An ordinary tenant user, used to prove a tenant token cannot reach a
    // platform route.
    await e2ePrisma.user.create({
      data: {
        name: 'E2E Owner',
        email: tenantOwner.email,
        passwordHash: await bcrypt.hash(TENANT_PASSWORD, 10),
        role: 'OWNER',
      },
    });

    mainAdmin.cookies = await platformLogin(mainAdmin.email);
  });

  afterAll(async () => {
    await resetDatabase(unscoped);
    await deleteProvisionedTenants();
    await app.close();
  });

  // --- helpers -------------------------------------------------------------

  /**
   * Every tenant this suite provisioned, so `tenants` rows do not accumulate
   * across runs. `resetDatabase` deliberately leaves `tenants` alone, and it
   * also never touches `business_profiles` — that table is a per-tenant
   * singleton every other suite upserts rather than deletes — so the profile
   * has to go first or the tenant delete fails its foreign key.
   */
  async function deleteProvisionedTenants(): Promise<void> {
    const provisioned = await unscoped.tenant.findMany({
      where: { slug: { startsWith: 'plat-' } },
      select: { id: true },
    });
    if (provisioned.length === 0) return;
    const ids = provisioned.map((t) => t.id);
    await unscoped.businessProfile.deleteMany({
      where: { tenantId: { in: ids } },
    });
    // The owner-email suite writes one supplier to prove the "tenant already
    // has data" gate. Cleared here rather than in that suite's own afterAll so
    // a run that dies mid-suite does not leave a row that makes the NEXT run's
    // tenant delete fail its (Restrict) foreign key.
    await unscoped.supplier.deleteMany({ where: { tenantId: { in: ids } } });
    await unscoped.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  async function platformLogin(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .send({ email, password: PLATFORM_PASSWORD })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  async function tenantLogin(
    email: string,
    password: string,
  ): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  /**
   * supertest types `body` as `any`; the other suites narrow at the use site
   * with `res.body as {...}`. Named `readBody` rather than `body` because the
   * provisioning block below has a request-payload fixture called `body`.
   */
  function readBody<T>(res: { body: unknown }): T {
    return res.body as T;
  }

  interface PlatformRoute {
    method: 'get' | 'post' | 'patch' | 'delete';
    path: string;
  }

  /**
   * Reads `@Module({ controllers })` off `PlatformModule` and then the
   * `@Controller()` / `@Get()` / `@Post()` metadata off each one, producing the
   * full `/platform/*` surface with `:id` segments filled in with a real uuid.
   */
  function platformRoutes(): PlatformRoute[] {
    const methodByCode: Record<number, PlatformRoute['method'] | undefined> = {
      [RequestMethod.GET]: 'get',
      [RequestMethod.POST]: 'post',
      [RequestMethod.PATCH]: 'patch',
      [RequestMethod.DELETE]: 'delete',
    };

    const controllers =
      (Reflect.getMetadata('controllers', PlatformModule) as
        Type<object>[] | undefined) ?? [];
    expect(controllers.length).toBeGreaterThan(0);

    const routes: PlatformRoute[] = [];
    for (const controller of controllers) {
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
      const proto = controller.prototype as Record<string, unknown>;
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue;
        const handler = proto[key];
        if (typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as
          string | undefined;
        const code = Reflect.getMetadata(METHOD_METADATA, handler) as
          number | undefined;
        if (sub === undefined || code === undefined) continue;
        const method = methodByCode[code];
        if (!method) continue;
        const path = `/api/v1/${base}/${sub}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '')
          .replace(':id', e2eTenantId);
        routes.push({ method, path });
      }
    }
    return routes;
  }

  // --- route protection ----------------------------------------------------

  describe('route protection (DEBT-066)', () => {
    it('rejects every /platform route with no token at all', async () => {
      const routes = platformRoutes();
      // Login and refresh are genuinely public — they are how a session starts.
      const guarded = routes.filter(
        (r) =>
          !r.path.endsWith('/auth/login') && !r.path.endsWith('/auth/refresh'),
      );
      expect(guarded.length).toBeGreaterThan(5);

      for (const route of guarded) {
        const res = await request(app.getHttpServer())[route.method](
          route.path,
        );
        expect({ ...route, status: res.status }).toEqual({
          ...route,
          status: 401,
        });
      }
    });

    it('rejects every /platform route when given a TENANT access token', async () => {
      // The point of separate secrets (ADR-025 Decision 5): an OWNER's own
      // valid token must not verify here.
      const cookies = await tenantLogin(tenantOwner.email, TENANT_PASSWORD);
      const guarded = platformRoutes().filter(
        (r) =>
          !r.path.endsWith('/auth/login') && !r.path.endsWith('/auth/refresh'),
      );

      for (const route of guarded) {
        const res = await request(app.getHttpServer())
          [route.method](route.path)
          .set('Cookie', cookies);
        expect({ ...route, status: res.status }).toEqual({
          ...route,
          status: 401,
        });
      }
    });

    it('rejects a PLATFORM token on a tenant route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', mainAdmin.cookies)
        .expect(401);
    });
  });

  // --- platform auth -------------------------------------------------------

  describe('authentication', () => {
    it('returns the admin profile for a valid session', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/platform/auth/me')
        .set('Cookie', mainAdmin.cookies)
        .expect(200);
      expect(res.body).toMatchObject({
        email: mainAdmin.email,
        isActive: true,
      });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a wrong password without saying which half was wrong', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({ email: mainAdmin.email, password: 'not-the-password' })
        .expect(401);
      expect(readBody<{ message: string }>(res).message).toContain(
        'Email atau kata sandi salah',
      );
    });

    it('rotates tokens on refresh and revokes everything on logout', async () => {
      const before = new Date();
      const cookies = await platformLogin(spareAdmin.email);

      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/refresh')
        .set('Cookie', cookies)
        .expect(200);
      const rotated = refreshed.get('Set-Cookie') ?? [];
      expect(rotated.join(';')).toContain('platform_access_token');

      await request(app.getHttpServer())
        .post('/api/v1/platform/auth/logout')
        .set('Cookie', rotated)
        .expect(200);

      // The refresh token is gone, so the session cannot be renewed.
      await request(app.getHttpServer())
        .post('/api/v1/platform/auth/refresh')
        .set('Cookie', rotated)
        .expect(401);

      // `tokenValidFrom` was bumped too, which is what kills already-issued
      // ACCESS tokens. Asserted against the row rather than over HTTP on
      // purpose: revocation is precise to the second (the `iat` claim has
      // whole-second resolution), so a token minted in the same second as the
      // logout legitimately survives it — the identical caveat documented on
      // JwtAuthGuard. An HTTP assertion here would be flaky by design.
      const row = await unscoped.platformAdmin.findUniqueOrThrow({
        where: { email: spareAdmin.email },
      });
      expect(row.refreshTokenHash).toBeNull();
      expect(row.tokenValidFrom.getTime()).toBeGreaterThan(
        before.getTime() - 1000,
      );
    });
  });

  // --- own password (TASK-130 B1) ------------------------------------------

  describe('PATCH /platform/auth/password', () => {
    /**
     * A dedicated admin per assertion. The endpoint revokes every session it
     * touches, so sharing one account across these would have each test
     * invalidate the next one's cookies rather than assert anything.
     */
    const NEW_PASSWORD = 'platform-password-5678';
    let subject: { email: string; cookies: string[] };

    async function makeAdmin(email: string): Promise<string[]> {
      await unscoped.platformAdmin.create({
        data: {
          name: 'Pwd Ops',
          email,
          passwordHash: await bcrypt.hash(PLATFORM_PASSWORD, 10),
        },
      });
      return platformLogin(email);
    }

    beforeAll(async () => {
      subject = {
        email: 'plat-pwd@ohmypos.local',
        cookies: await makeAdmin('plat-pwd@ohmypos.local'),
      };
    });

    it('rejects a caller with no platform session', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/platform/auth/password')
        .send({ oldPassword: PLATFORM_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('rejects an ordinary TENANT token, not merely a missing one', async () => {
      // What proves `@Public()` + PlatformAuthGuard separates two audiences
      // rather than just opening the door (DEBT-066).
      const cookies = await tenantLogin(tenantOwner.email, TENANT_PASSWORD);
      await request(app.getHttpServer())
        .patch('/api/v1/platform/auth/password')
        .set('Cookie', cookies)
        .send({ oldPassword: PLATFORM_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('rejects a wrong current password with 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/platform/auth/password')
        .set('Cookie', subject.cookies)
        .send({ oldPassword: 'not-the-password', newPassword: NEW_PASSWORD })
        .expect(401);
      expect(readBody<{ message: string }>(res).message).toContain(
        'Kata sandi saat ini salah',
      );
    });

    it('rejects a new password under 12 characters with 400', async () => {
      // The floor `create-platform-admin.ts` has always enforced. Eight would
      // be a way around it, so the schema says twelve here too.
      await request(app.getHttpServer())
        .patch('/api/v1/platform/auth/password')
        .set('Cookie', subject.cookies)
        .send({ oldPassword: PLATFORM_PASSWORD, newPassword: 'sebelas-kar' })
        .expect(400);
    });

    it('changes the password and revokes the session that made the call', async () => {
      const before = new Date();

      await request(app.getHttpServer())
        .patch('/api/v1/platform/auth/password')
        .set('Cookie', subject.cookies)
        .send({ oldPassword: PLATFORM_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      // Read before anything logs in again — a later login writes a fresh
      // `refreshTokenHash`, which would make this assertion pass or fail on
      // test ordering rather than on behaviour.
      const row = await unscoped.platformAdmin.findUniqueOrThrow({
        where: { email: subject.email },
      });
      expect(row.refreshTokenHash).toBeNull();
      expect(row.tokenValidFrom.getTime()).toBeGreaterThan(
        before.getTime() - 1000,
      );

      // And over HTTP: the refresh token presented is no longer renewable.
      // Asserted on refresh rather than on an access-token route because
      // revocation by `tokenValidFrom` is precise to the second — an access
      // token minted in the same second legitimately survives it, the identical
      // caveat the logout test above documents.
      await request(app.getHttpServer())
        .post('/api/v1/platform/auth/refresh')
        .set('Cookie', subject.cookies)
        .expect(401);
    });

    it('accepts the new password at login and refuses the old one', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({ email: subject.email, password: NEW_PASSWORD })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({ email: subject.email, password: PLATFORM_PASSWORD })
        .expect(401);
    });
  });

  // --- tenant provisioning -------------------------------------------------

  describe('tenant provisioning', () => {
    let createdTenantId: string;

    const body = {
      name: 'Kopi Plat',
      slug: 'plat-kopi',
      owner: {
        name: 'Plat Owner',
        email: 'plat-new-owner@test.local',
        password: 'NewOwner123!',
      },
    };

    it('creates the tenant, its profile, its system refs and its OWNER in one call', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/tenants')
        .set('Cookie', mainAdmin.cookies)
        .send(body)
        .expect(201);

      createdTenantId = readBody<{ id: string }>(res).id;
      expect(res.body).toMatchObject({ slug: 'plat-kopi', status: 'ACTIVE' });

      // ADR-025 Decision 7 — without these the tenant's FIRST sale and FIRST
      // central purchase fail with a 503 from system-refs.ts.
      const scoped = unscoped.$extends(
        tenantBoundExtension(createdTenantId),
      ) as unknown as PrismaService;

      await expect(
        scoped.branch.findFirst({ where: { isSystem: true } }),
      ).resolves.toMatchObject({ name: 'Umum' });

      const categories = await scoped.category.findMany({
        orderBy: { name: 'asc' },
      });
      expect(categories.map((c) => c.name)).toEqual([
        'Pembelian Bahan Baku',
        'Penjualan',
      ]);

      await expect(scoped.businessProfile.findFirst()).resolves.toMatchObject({
        name: 'Kopi Plat',
      });

      const owner = await scoped.user.findFirst();
      expect(owner).toMatchObject({
        email: body.owner.email,
        role: 'OWNER',
        branchId: null,
      });
    });

    it('gives the new tenant its own system refs, not the existing tenant’s', async () => {
      // The subtle failure ADR-025 §2.6 warns about: seeding through an
      // unfiltered client would find the e2e tenant's `isSystem` branch and
      // skip creating one, silently attaching the new tenant's central ledger
      // entries to another business.
      const own = await unscoped.branch.findMany({
        where: { isSystem: true },
        select: { tenantId: true },
      });
      const tenantIds = own.map((b) => b.tenantId).sort();
      expect(tenantIds).toContain(createdTenantId);
      expect(new Set(tenantIds).size).toBe(tenantIds.length);
    });

    it('lets two tenants hold a product with the SAME name', async () => {
      // Proof that the global uniques really did become composite (§1.3).
      const other = unscoped.$extends(
        tenantBoundExtension(createdTenantId),
      ) as unknown as PrismaService;

      await e2ePrisma.product.create({
        data: { name: 'Es Kopi Susu', sellPrice: '18000' },
      });
      await expect(
        other.product.create({
          data: { name: 'Es Kopi Susu', sellPrice: '20000' },
        }),
      ).resolves.toMatchObject({ tenantId: createdTenantId });
    });

    it('rejects a duplicate slug and a duplicate owner email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/platform/tenants')
        .set('Cookie', mainAdmin.cookies)
        .send({ ...body, owner: { ...body.owner, email: 'other@test.local' } })
        .expect(409);

      await request(app.getHttpServer())
        .post('/api/v1/platform/tenants')
        .set('Cookie', mainAdmin.cookies)
        .send({ ...body, slug: 'plat-other' })
        .expect(409);
    });

    it('reports the tenant with its usage figures', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/platform/tenants/${createdTenantId}`)
        .set('Cookie', mainAdmin.cookies)
        .expect(200);

      // `ownerId` rides along with `ownerEmail` so the console can name WHICH
      // owner a password reset targets (TASK-130).
      expect(readBody<{ ownerId: string | null }>(res).ownerId).toEqual(
        expect.any(String),
      );
      expect(res.body).toMatchObject({
        slug: 'plat-kopi',
        userCount: 1,
        branchCount: 1,
        saleCount: 0,
        productCount: 1,
        ownerEmail: body.owner.email,
        // Money crosses the boundary as a fixed-scale string (Playbook §5).
        grossRevenue: '0.00',
        lastSaleAt: null,
      });
    });

    it('404s for a tenant that does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/platform/tenants/00000000-0000-4000-8000-000000000000')
        .set('Cookie', mainAdmin.cookies)
        .expect(404);
    });

    it('counts the new tenant in the cross-tenant metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/platform/metrics/overview')
        .set('Cookie', mainAdmin.cookies)
        .expect(200);

      const metrics = readBody<{
        tenantCount: number;
        activeTenantCount: number;
        grossRevenue: string;
        recentTenants: { id: string }[];
      }>(res);
      expect(metrics.tenantCount).toBeGreaterThanOrEqual(2);
      expect(metrics.activeTenantCount).toBeGreaterThanOrEqual(2);
      expect(metrics.grossRevenue).toBe('0.00');
      expect(metrics.recentTenants.some((t) => t.id === createdTenantId)).toBe(
        true,
      );
    });

    it('suspends the tenant, locking its users out but leaving logout working', async () => {
      const ownerCookies = await tenantLogin(
        body.owner.email,
        body.owner.password,
      );
      await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', ownerCookies)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${createdTenantId}`)
        .set('Cookie', mainAdmin.cookies)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const blocked = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Cookie', ownerCookies)
        .expect(403);
      expect(readBody<{ message: string }>(blocked).message).toContain(
        'ditangguhkan',
      );

      // Exempt on purpose: a user suspended mid-session must still be able to
      // end that session cleanly.
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', ownerCookies)
        .expect(200);
    });

    it('reactivates the tenant', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${createdTenantId}`)
        .set('Cookie', mainAdmin.cookies)
        .send({ status: 'ACTIVE' })
        .expect(200);
    });
  });

  // --- owner password reset (TASK-130 A2a) ---------------------------------

  /**
   * Budget note, because it is a real constraint and not an accident: this
   * route is throttled at 5/60s (tighter than the usual 10 — nobody legitimately
   * resets five owner passwords in a minute), and the route-protection block
   * above spends TWO of those on every run when it probes every `/platform/*`
   * path. That leaves three for this block. Adding a fourth request here turns
   * the last test into a 429 rather than an assertion.
   */
  describe('POST /platform/tenants/:id/reset-owner-password', () => {
    const NEW_OWNER_PASSWORD = 'OwnerResetBaru456!';
    const REASON = 'Owner melapor terkunci dan tidak ada Owner lain';
    let tenantId: string;
    let ownerId: string;

    beforeAll(async () => {
      const tenant = await unscoped.tenant.findUniqueOrThrow({
        where: { slug: 'plat-kopi' },
      });
      tenantId = tenant.id;
      ownerId = (
        await unscoped.user.findUniqueOrThrow({
          where: { email: 'plat-new-owner@test.local' },
        })
      ).id;
    });

    it('requires a substantive reason, like impersonation does', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/platform/tenants/${tenantId}/reset-owner-password`)
        .set('Cookie', mainAdmin.cookies)
        .send({ userId: ownerId, newPassword: NEW_OWNER_PASSWORD, reason: 'x' })
        .expect(400);
    });

    it('404s for a user who is not an OWNER of this tenant', async () => {
      // The e2e tenant's own OWNER — a real user, real OWNER, wrong tenant.
      // 404 rather than 403: saying "wrong tenant" would confirm the id exists
      // somewhere, which is the leak the isolation suite exists to prevent.
      const outsider = await unscoped.user.findUniqueOrThrow({
        where: { email: tenantOwner.email },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/platform/tenants/${tenantId}/reset-owner-password`)
        .set('Cookie', mainAdmin.cookies)
        .send({
          userId: outsider.id,
          newPassword: NEW_OWNER_PASSWORD,
          reason: REASON,
        })
        .expect(404);

      // And nothing was written to the user who was wrongly named.
      const after = await unscoped.user.findUniqueOrThrow({
        where: { id: outsider.id },
      });
      expect(after.tokenValidFrom).toEqual(outsider.tokenValidFrom);
    });

    it('resets the owner password and revokes their sessions', async () => {
      const before = await unscoped.user.findUniqueOrThrow({
        where: { id: ownerId },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/platform/tenants/${tenantId}/reset-owner-password`)
        .set('Cookie', mainAdmin.cookies)
        .send({
          userId: ownerId,
          newPassword: NEW_OWNER_PASSWORD,
          reason: REASON,
        })
        .expect(200);
      // The password never comes back out (Playbook §9).
      expect(JSON.stringify(res.body)).not.toContain(NEW_OWNER_PASSWORD);

      const after = await unscoped.user.findUniqueOrThrow({
        where: { id: ownerId },
      });
      expect(after.passwordHash).not.toBe(before.passwordHash);
      expect(after.refreshTokenHash).toBeNull();
      expect(after.tokenValidFrom.getTime()).toBeGreaterThan(
        before.tokenValidFrom.getTime(),
      );

      // The point of the whole endpoint: the owner can get back in.
      await tenantLogin('plat-new-owner@test.local', NEW_OWNER_PASSWORD);
    });
  });

  // --- impersonation -------------------------------------------------------

  describe('impersonation (ADR-025 Decision 8)', () => {
    let tenantId: string;
    let token: string;
    let sessionId: string;

    beforeAll(async () => {
      const tenant = await unscoped.tenant.findUniqueOrThrow({
        where: { slug: 'plat-kopi' },
      });
      tenantId = tenant.id;
    });

    it('requires a substantive reason', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/platform/tenants/${tenantId}/impersonate`)
        .set('Cookie', mainAdmin.cookies)
        .send({ reason: 'debug' })
        .expect(400);
    });

    it('mints a token and records the session', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/platform/tenants/${tenantId}/impersonate`)
        .set('Cookie', mainAdmin.cookies)
        .send({ reason: 'Investigating a reported HPP discrepancy' })
        .expect(201);

      const started = readBody<{
        accessToken: string;
        id: string;
        endedAt: string | null;
        actingAsEmail: string;
      }>(res);
      token = started.accessToken;
      sessionId = started.id;
      expect(token).toBeTruthy();
      expect(started.endedAt).toBeNull();
      expect(started.actingAsEmail).toBe('plat-new-owner@test.local');

      const stored = await unscoped.impersonationSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.reason).toBe('Investigating a reported HPP discrepancy');
      expect(stored.tenantId).toBe(tenantId);
    });

    it('reads the tenant’s data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // The tenant's own system branch, and nothing from the e2e tenant.
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('refuses to write anything', async () => {
      for (const attempt of [
        () =>
          request(app.getHttpServer())
            .post('/api/v1/branches')
            .send({ name: 'Cabang Baru' }),
        () =>
          request(app.getHttpServer())
            .patch('/api/v1/business-profile')
            .send({ name: 'Diubah' }),
        () => request(app.getHttpServer()).delete('/api/v1/branches/whatever'),
      ]) {
        const res = await attempt().set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(readBody<{ message: string }>(res).message).toContain(
          'hanya bisa membaca',
        );
      }
    });

    it('still reads a SUSPENDED tenant, which is when an operator most needs to', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${tenantId}`)
        .set('Cookie', mainAdmin.cookies)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${tenantId}`)
        .set('Cookie', mainAdmin.cookies)
        .send({ status: 'ACTIVE' })
        .expect(200);
    });

    it('records the session in the tenant’s audit trail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/platform/tenants/${tenantId}/impersonations`)
        .set('Cookie', mainAdmin.cookies)
        .expect(200);
      expect(readBody<{ id: string; reason: string }[]>(res)[0]).toMatchObject({
        id: sessionId,
        reason: 'Investigating a reported HPP discrepancy',
      });
    });

    it('closes the session, stamping endedAt', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/impersonation/end')
        .set('Cookie', mainAdmin.cookies)
        .expect(200);

      const ended = readBody<{ id: string; endedAt: string | null }>(res);
      expect(ended.id).toBe(sessionId);
      expect(ended.endedAt).not.toBeNull();

      // Nothing left open, so a second call has nothing to close.
      await request(app.getHttpServer())
        .post('/api/v1/platform/impersonation/end')
        .set('Cookie', mainAdmin.cookies)
        .expect(404);
    });
  });
  // --- owner login email (TASK-131) ----------------------------------------

  /**
   * Runs LAST on purpose: it rewrites `plat-kopi`'s owner email, and the
   * impersonation suite above asserts on that address.
   *
   * Same throttle budget as the password reset — 5/60s, minus the two the
   * route-protection block spends probing every `/platform/*` path, leaving
   * three. Each test below makes exactly one throttled request; a fourth turns
   * the last assertion into a 429.
   */
  describe('PATCH /platform/tenants/:id/owner-email', () => {
    const OWNER_PASSWORD = 'OwnerResetBaru456!';
    const CORRECTED_EMAIL = 'plat-owner-benar@test.local';
    const REASON = 'Email owner salah ketik saat pendaftaran tenant';
    let tenantId: string;
    let ownerId: string;

    beforeAll(async () => {
      const tenant = await unscoped.tenant.findUniqueOrThrow({
        where: { slug: 'plat-kopi' },
      });
      tenantId = tenant.id;
      ownerId = (
        await unscoped.user.findUniqueOrThrow({
          where: { email: 'plat-new-owner@test.local' },
        })
      ).id;
    });

    it('404s for a user who is not an OWNER of this tenant', async () => {
      // Same shape as the password reset: 404 rather than 403, because naming
      // the tenant would confirm the id exists somewhere.
      const outsider = await unscoped.user.findUniqueOrThrow({
        where: { email: tenantOwner.email },
      });
      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${tenantId}/owner-email`)
        .set('Cookie', mainAdmin.cookies)
        .send({
          userId: outsider.id,
          newEmail: CORRECTED_EMAIL,
          reason: REASON,
        })
        .expect(404);

      const after = await unscoped.user.findUniqueOrThrow({
        where: { id: outsider.id },
      });
      expect(after.email).toBe(tenantOwner.email);
    });

    it('refuses on a tenant that already holds data unless told to proceed', async () => {
      // One supplier is enough — the gate is "has this tenant been used", not
      // "has it traded". Written directly, because the point is the tenant's
      // state, not the route that would create it.
      await unscoped.supplier.create({
        data: { tenantId, name: 'Supplier Uji Gerbang' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${tenantId}/owner-email`)
        .set('Cookie', mainAdmin.cookies)
        .send({ userId: ownerId, newEmail: CORRECTED_EMAIL, reason: REASON })
        .expect(409);
      // The refusal has to say WHAT it found, or the operator cannot judge
      // whether to acknowledge it.
      expect(readBody<{ message: string }>(res).message).toContain(
        '1 supplier',
      );

      const untouched = await unscoped.user.findUniqueOrThrow({
        where: { id: ownerId },
      });
      expect(untouched.email).toBe('plat-new-owner@test.local');
    });

    it('changes the email once acknowledged, and revokes the owner’s sessions', async () => {
      const before = await unscoped.user.findUniqueOrThrow({
        where: { id: ownerId },
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${tenantId}/owner-email`)
        .set('Cookie', mainAdmin.cookies)
        .send({
          userId: ownerId,
          newEmail: CORRECTED_EMAIL,
          reason: REASON,
          acknowledgeExistingData: true,
        })
        .expect(200);

      const after = await unscoped.user.findUniqueOrThrow({
        where: { id: ownerId },
      });
      expect(after.email).toBe(CORRECTED_EMAIL);
      expect(after.refreshTokenHash).toBeNull();
      expect(after.tokenValidFrom.getTime()).toBeGreaterThan(
        before.tokenValidFrom.getTime(),
      );
      // The password is untouched — this endpoint moves the identity, not the
      // credential.
      expect(after.passwordHash).toBe(before.passwordHash);

      // The point of the whole endpoint: the owner gets in at the new address.
      await tenantLogin(CORRECTED_EMAIL, OWNER_PASSWORD);
    });
  });
});
