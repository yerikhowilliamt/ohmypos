import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AttendanceListResponse } from '@ohmypos/api-contracts';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * GET /devices/attendance — date range + pagination (TASK-071).
 *
 * The fixtures are pinned to April 2027, a window no other suite in this repo
 * writes to, because the e2e suites share one database and may run in parallel.
 */
describe('Attendance list (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPass123!';
  const owner = { email: 'att-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'att-admin@test.local', cookies: [] as string[] };
  const kasir = {
    email: 'att-kasir@test.local',
    cookies: [] as string[],
    id: '',
  };
  const kasirB = { email: 'att-kasir-b@test.local', id: '' };

  let branchAId = '';
  let branchBId = '';
  let deviceAId = '';

  /** The login at 23:30 on the last day of the month — see the inclusivity test. */
  let lastInstantId = '';
  /** The single violation, on 10 April. */
  let violationId = '';

  const MONTH_START = '2027-04-01T00:00:00.000Z';
  const MONTH_END = '2027-04-30T23:59:59.999Z';

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

    const branchA = await prisma.branch.create({
      data: { name: 'Attendance Branch A' },
    });
    const branchB = await prisma.branch.create({
      data: { name: 'Attendance Branch B' },
    });
    branchAId = branchA.id;
    branchBId = branchB.id;

    const device = await prisma.device.create({
      data: {
        branchId: branchAId,
        label: 'Attendance Terminal A',
        isActive: true,
      },
    });
    deviceAId = device.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name: 'Attendance Owner',
        email: owner.email,
        passwordHash,
        role: 'OWNER',
      },
    });
    await prisma.user.create({
      data: {
        name: 'Attendance Admin',
        email: admin.email,
        passwordHash,
        role: 'ADMIN',
      },
    });
    const kasirUser = await prisma.user.create({
      data: {
        name: 'Zulfa Attendance',
        email: kasir.email,
        passwordHash,
        role: 'KASIR',
        branchId: branchAId,
      },
    });
    kasir.id = kasirUser.id;
    const kasirBUser = await prisma.user.create({
      data: {
        name: 'Adi Attendance',
        email: kasirB.email,
        passwordHash,
        role: 'KASIR',
        branchId: branchBId,
      },
    });
    kasirB.id = kasirBUser.id;

    await seedRecords();

    owner.cookies = await login(owner.email);
    admin.cookies = await login(admin.email);
    kasir.cookies = await login(kasir.email);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  /**
   * Ten logins across April 2027 for branch A's kasir plus one for branch B.
   *
   * `createdAt` is written into a DIFFERENT month (June) and in the REVERSE
   * order of `loginAt`. Both columns default to now() in production, so they are
   * always equal there and a filter on the wrong one would pass silently. Here
   * they disagree, so a service reading `createdAt` fails visibly.
   */
  async function seedRecords() {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const day = i + 1;
      return {
        userId: kasir.id,
        deviceId: deviceAId,
        // 1 Apr .. 10 Apr, ascending
        loginAt: new Date(Date.UTC(2027, 3, day, 8, 0, 0)),
        // 20 Jun .. 11 Jun, descending — deliberately the opposite order
        createdAt: new Date(Date.UTC(2027, 5, 21 - day, 8, 0, 0)),
        isValid: day !== 10,
        violationReason: day === 10 ? ('NO_DEVICE_COOKIE' as const) : null,
      };
    });

    for (const row of rows) {
      const created = await prisma.attendanceRecord.create({ data: row });
      if (!row.isValid) violationId = created.id;
    }

    // The final instant of the month: 30 April 23:30. A filter whose upper
    // bound is midnight of the 30th silently loses this row.
    const last = await prisma.attendanceRecord.create({
      data: {
        userId: kasir.id,
        deviceId: deviceAId,
        loginAt: new Date(Date.UTC(2027, 3, 30, 23, 30, 0)),
        isValid: true,
      },
    });
    lastInstantId = last.id;

    // One row outside April entirely, to prove the window excludes as well as includes.
    await prisma.attendanceRecord.create({
      data: {
        userId: kasir.id,
        deviceId: deviceAId,
        loginAt: new Date(Date.UTC(2027, 4, 5, 8, 0, 0)),
        isValid: true,
      },
    });

    // Branch B, so branchId filtering has something to exclude.
    await prisma.attendanceRecord.create({
      data: {
        userId: kasirB.id,
        deviceId: null,
        loginAt: new Date(Date.UTC(2027, 3, 15, 8, 0, 0)),
        isValid: true,
      },
    });
  }

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  const emails = [owner.email, admin.email, kasir.email, kasirB.email];

  async function cleanup() {
    await prisma.attendanceRecord.deleteMany({
      where: { user: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.device.deleteMany({
      where: { label: 'Attendance Terminal A' },
    });
    await prisma.branch.deleteMany({
      where: { name: { in: ['Attendance Branch A', 'Attendance Branch B'] } },
    });
  }

  function get(path: string, cookies: string[]) {
    return request(app.getHttpServer())
      .get(`/api/v1/devices/attendance${path}`)
      .set('Cookie', cookies);
  }

  describe('access control', () => {
    it('allows OWNER', async () => {
      await get('', owner.cookies).expect(200);
    });

    it('forbids ADMIN', async () => {
      await get('', admin.cookies).expect(403);
    });

    it('forbids KASIR', async () => {
      await get('', kasir.cookies).expect(403);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/devices/attendance')
        .expect(401);
    });
  });

  describe('date window', () => {
    it('filters loginAt, not createdAt', async () => {
      // April holds the seeded loginAt values; June holds their createdAt
      // values. A service filtering the wrong column inverts these two results.
      const april = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&limit=100`,
        owner.cookies,
      ).expect(200);
      const juneOnly = await get(
        '?startDate=2027-06-01T00:00:00.000Z&endDate=2027-06-30T23:59:59.999Z&limit=100',
        owner.cookies,
      ).expect(200);

      const aprilBody = april.body as AttendanceListResponse;
      const juneBody = juneOnly.body as AttendanceListResponse;

      // 10 seeded April logins + the 30 Apr 23:30 row + branch B's 15 Apr row
      expect(aprilBody.meta.total).toBe(12);
      // Nothing logged in during June, even though every createdAt lives there.
      expect(juneBody.meta.total).toBe(0);
    });

    it('includes the whole final day, not just its midnight', async () => {
      const res = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&limit=100`,
        owner.cookies,
      ).expect(200);
      const ids = (res.body as AttendanceListResponse).data.map((r) => r.id);
      expect(ids).toContain(lastInstantId);

      // The same window cut at midnight of the 30th must drop it — this is what
      // proves the assertion above is actually testing the bound.
      const cutAtMidnight = await get(
        `?startDate=${MONTH_START}&endDate=2027-04-30T00:00:00.000Z&limit=100`,
        owner.cookies,
      ).expect(200);
      const midnightIds = (
        cutAtMidnight.body as AttendanceListResponse
      ).data.map((r) => r.id);
      expect(midnightIds).not.toContain(lastInstantId);
    });

    it('excludes logins outside the window', async () => {
      const res = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&limit=100`,
        owner.cookies,
      ).expect(200);
      const outside = (res.body as AttendanceListResponse).data.filter(
        (r) => new Date(r.loginAt).getUTCMonth() !== 3,
      );
      expect(outside).toHaveLength(0);
    });
  });

  describe('pagination', () => {
    it('returns a data/meta envelope whose total counts the match, not the page', async () => {
      const res = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&limit=5&page=1`,
        owner.cookies,
      ).expect(200);
      const body = res.body as AttendanceListResponse;
      expect(body.data).toHaveLength(5);
      expect(body.meta.total).toBe(12);
      expect(body.meta.limit).toBe(5);
      expect(body.meta.page).toBe(1);
      expect(body.meta.totalPages).toBe(3);
    });

    it('returns disjoint pages', async () => {
      const q = `?startDate=${MONTH_START}&endDate=${MONTH_END}&limit=5&sortBy=loginAt&sortOrder=asc`;
      const p1 = await get(`${q}&page=1`, owner.cookies).expect(200);
      const p2 = await get(`${q}&page=2`, owner.cookies).expect(200);

      const ids1 = (p1.body as AttendanceListResponse).data.map((r) => r.id);
      const ids2 = (p2.body as AttendanceListResponse).data.map((r) => r.id);
      expect(ids1).toHaveLength(5);
      expect(ids2).toHaveLength(5);
      expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
    });

    it('reports totalPages 1 for an empty result rather than 0', async () => {
      const res = await get(
        '?startDate=2035-01-01T00:00:00.000Z&endDate=2035-01-31T23:59:59.999Z',
        owner.cookies,
      ).expect(200);
      const body = res.body as AttendanceListResponse;
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
      expect(body.meta.totalPages).toBe(1);
    });
  });

  describe('sorting', () => {
    it('honours sortOrder — asc and desc return opposite ends', async () => {
      const base = `?startDate=${MONTH_START}&endDate=${MONTH_END}&sortBy=loginAt&limit=1`;
      const asc = await get(`${base}&sortOrder=asc`, owner.cookies).expect(200);
      const desc = await get(`${base}&sortOrder=desc`, owner.cookies).expect(
        200,
      );

      const first = (asc.body as AttendanceListResponse).data[0];
      const last = (desc.body as AttendanceListResponse).data[0];
      expect(first.id).not.toBe(last.id);
      expect(new Date(first.loginAt).getTime()).toBeLessThan(
        new Date(last.loginAt).getTime(),
      );
      // The earliest April login is the 1st; the latest is the 30 Apr 23:30 row.
      expect(new Date(first.loginAt).getUTCDate()).toBe(1);
      expect(last.id).toBe(lastInstantId);
    });

    it('sorts by the joined user name', async () => {
      const base = `?startDate=${MONTH_START}&endDate=${MONTH_END}&sortBy=userName&limit=1`;
      const asc = await get(`${base}&sortOrder=asc`, owner.cookies).expect(200);
      const desc = await get(`${base}&sortOrder=desc`, owner.cookies).expect(
        200,
      );
      // 'Adi Attendance' < 'Zulfa Attendance'
      expect((asc.body as AttendanceListResponse).data[0].userName).toBe(
        'Adi Attendance',
      );
      expect((desc.body as AttendanceListResponse).data[0].userName).toBe(
        'Zulfa Attendance',
      );
    });

    it('sorts by the joined branch name', async () => {
      const base = `?startDate=${MONTH_START}&endDate=${MONTH_END}&sortBy=branchName&limit=1`;
      const asc = await get(`${base}&sortOrder=asc`, owner.cookies).expect(200);
      const desc = await get(`${base}&sortOrder=desc`, owner.cookies).expect(
        200,
      );
      expect((asc.body as AttendanceListResponse).data[0].branchName).toBe(
        'Attendance Branch A',
      );
      expect((desc.body as AttendanceListResponse).data[0].branchName).toBe(
        'Attendance Branch B',
      );
    });
  });

  describe('filters', () => {
    it('violationOnly returns only invalid records', async () => {
      const res = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&violationOnly=true&limit=100`,
        owner.cookies,
      ).expect(200);
      const body = res.body as AttendanceListResponse;
      expect(body.meta.total).toBe(1);
      expect(body.data[0].id).toBe(violationId);
      expect(body.data[0].isValid).toBe(false);
      expect(body.data[0].violationReason).toBe('NO_DEVICE_COOKIE');
    });

    it('branchId narrows to that branch', async () => {
      const a = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&branchId=${branchAId}&limit=100`,
        owner.cookies,
      ).expect(200);
      const b = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&branchId=${branchBId}&limit=100`,
        owner.cookies,
      ).expect(200);

      expect((a.body as AttendanceListResponse).meta.total).toBe(11);
      expect((b.body as AttendanceListResponse).meta.total).toBe(1);
      expect((b.body as AttendanceListResponse).data[0].userName).toBe(
        'Adi Attendance',
      );
    });

    it('keeps a record whose device is null rather than dropping it', async () => {
      // Branch B's login has deviceId = null. An inner join on device would
      // make it vanish; the row must survive with deviceLabel null.
      const res = await get(
        `?startDate=${MONTH_START}&endDate=${MONTH_END}&branchId=${branchBId}&limit=100`,
        owner.cookies,
      ).expect(200);
      const row = (res.body as AttendanceListResponse).data[0];
      expect(row.deviceId).toBeNull();
      expect(row.deviceLabel).toBeNull();
      expect(row.branchName).toBe('Attendance Branch B');
    });
  });

  describe('contract', () => {
    it('rejects a limit above the ceiling', async () => {
      await get('?limit=501', owner.cookies).expect(400);
    });

    it('rejects an unknown sortBy rather than ignoring it', async () => {
      await get('?sortBy=ipAddress', owner.cookies).expect(400);
    });
  });
});
