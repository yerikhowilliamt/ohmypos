import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  LeaveRequestListResponse,
  LeaveRequestResponse,
} from '@ohmypos/api-contracts';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Leave Requests (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let branchId: string;
  const password = 'TestPass123!';
  const owner = { email: 'leave-owner@test.local', cookies: [] as string[] };
  const kasir = {
    email: 'leave-kasir@test.local',
    cookies: [] as string[],
    id: '',
  };

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
      data: { name: 'Leave Test Branch' },
    });
    branchId = branch.id;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name: 'Leave Owner',
        email: owner.email,
        passwordHash,
        role: 'OWNER',
      },
    });

    const kasirUser = await prisma.user.create({
      data: {
        name: 'Leave Kasir',
        email: kasir.email,
        passwordHash,
        role: 'KASIR',
        branchId,
      },
    });
    kasir.id = kasirUser.id;

    owner.cookies = await login(owner.email);
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
    await prisma.leaveRequest.deleteMany({
      where: {
        user: {
          email: {
            in: [owner.email, kasir.email],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [owner.email, kasir.email],
        },
      },
    });
    if (branchId) {
      await prisma.branch.deleteMany({
        where: { id: branchId },
      });
    }
  }

  it('allows KASIR to submit a leave request and view it via findMine', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/leave-requests')
      .set('Cookie', kasir.cookies)
      .send({
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        reason: 'Acara keluarga',
      })
      .expect(201);

    const created = createRes.body as LeaveRequestResponse;
    expect(created.userId).toBe(kasir.id);
    expect(created.status).toBe('PENDING');
    expect(created.startDate).toBe('2026-09-01');
    expect(created.endDate).toBe('2026-09-03');

    const mineRes = await request(app.getHttpServer())
      .get('/api/v1/leave-requests/me')
      .set('Cookie', kasir.cookies)
      .expect(200);

    const mineList = mineRes.body as LeaveRequestResponse[];
    expect(mineList).toHaveLength(1);
    expect(mineList[0].id).toBe(created.id);
  });

  it('rejects leave request when endDate precedes startDate', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/leave-requests')
      .set('Cookie', kasir.cookies)
      .send({
        startDate: '2026-09-05',
        endDate: '2026-09-01',
        reason: 'Invalid date range',
      })
      .expect(400);
  });

  it('forbids KASIR from listing all leave requests or approving/rejecting', async () => {
    const mineRes = await request(app.getHttpServer())
      .get('/api/v1/leave-requests/me')
      .set('Cookie', kasir.cookies)
      .expect(200);
    const requestId = (mineRes.body as LeaveRequestResponse[])[0].id;

    await request(app.getHttpServer())
      .get('/api/v1/leave-requests')
      .set('Cookie', kasir.cookies)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/leave-requests/${requestId}/approve`)
      .set('Cookie', kasir.cookies)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/leave-requests/${requestId}/reject`)
      .set('Cookie', kasir.cookies)
      .expect(403);
  });

  it('allows OWNER to list all leave requests and approve a pending request', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/leave-requests')
      .set('Cookie', owner.cookies)
      .expect(200);

    const listBody = listRes.body as LeaveRequestListResponse;
    const list = listBody.data;
    expect(listBody.meta.total).toBeGreaterThanOrEqual(1);
    expect(listBody.meta.page).toBe(1);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const target = list.find((r) => r.userId === kasir.id);
    expect(target).toBeDefined();
    expect(target?.status).toBe('PENDING');
    expect(target?.user?.name).toBe('Leave Kasir');
    expect(target?.user?.email).toBe(kasir.email);

    const approveRes = await request(app.getHttpServer())
      .patch(`/api/v1/leave-requests/${target!.id}/approve`)
      .set('Cookie', owner.cookies)
      .expect(200);

    const approved = approveRes.body as LeaveRequestResponse;
    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedByUserId).toBeDefined();
    expect(approved.reviewedAt).toBeDefined();

    // Secondary review attempt returns 400
    await request(app.getHttpServer())
      .patch(`/api/v1/leave-requests/${target!.id}/approve`)
      .set('Cookie', owner.cookies)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/leave-requests/${target!.id}/reject`)
      .set('Cookie', owner.cookies)
      .expect(400);
  });

  it('allows OWNER to reject a pending request', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/leave-requests')
      .set('Cookie', kasir.cookies)
      .send({
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        reason: 'Keperluan pribadi',
      })
      .expect(201);

    const created = createRes.body as LeaveRequestResponse;
    const rejectRes = await request(app.getHttpServer())
      .patch(`/api/v1/leave-requests/${created.id}/reject`)
      .set('Cookie', owner.cookies)
      .expect(200);

    const rejected = rejectRes.body as LeaveRequestResponse;
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reviewedByUserId).toBeDefined();
  });
  describe('pagination, overlap window and sorting', () => {
    /**
     * Three requests owned by the kasir, in a month no other test in this file
     * touches, so the assertions below stay stable as tests are added above.
     *
     * `spanning` deliberately straddles the Nov/Dec boundary: it is the fixture
     * that separates an overlap filter from a containment filter.
     */
    let earlyId = '';
    let spanningId = '';
    let lateId = '';

    beforeAll(async () => {
      const early = await prisma.leaveRequest.create({
        data: {
          userId: kasir.id,
          startDate: new Date('2027-11-02'),
          endDate: new Date('2027-11-04'),
          reason: 'Window fixture: early November',
          status: 'APPROVED',
        },
      });
      earlyId = early.id;

      const spanning = await prisma.leaveRequest.create({
        data: {
          userId: kasir.id,
          startDate: new Date('2027-11-28'),
          endDate: new Date('2027-12-03'),
          reason: 'Window fixture: spans the month boundary',
          status: 'APPROVED',
        },
      });
      spanningId = spanning.id;

      const late = await prisma.leaveRequest.create({
        data: {
          userId: kasir.id,
          startDate: new Date('2027-12-20'),
          endDate: new Date('2027-12-22'),
          reason: 'Window fixture: late December',
          status: 'APPROVED',
        },
      });
      lateId = late.id;
    });

    it('returns a data/meta envelope with a total that counts the whole match, not the page', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/leave-requests?userId=' + kasir.id + '&limit=1&page=1')
        .set('Cookie', owner.cookies)
        .expect(200);

      const body = res.body as LeaveRequestListResponse;
      expect(body.data).toHaveLength(1);
      expect(body.meta.limit).toBe(1);
      expect(body.meta.total).toBeGreaterThan(1);
      expect(body.meta.totalPages).toBe(body.meta.total);
    });

    it('returns disjoint pages', async () => {
      const q = `/api/v1/leave-requests?userId=${kasir.id}&limit=1&sortBy=startDate&sortOrder=asc`;
      const first = await request(app.getHttpServer())
        .get(`${q}&page=1`)
        .set('Cookie', owner.cookies)
        .expect(200);
      const second = await request(app.getHttpServer())
        .get(`${q}&page=2`)
        .set('Cookie', owner.cookies)
        .expect(200);

      const a = (first.body as LeaveRequestListResponse).data[0];
      const b = (second.body as LeaveRequestListResponse).data[0];
      expect(a.id).not.toBe(b.id);
    });

    it('honours sortOrder — asc and desc return different first rows', async () => {
      const base = `/api/v1/leave-requests?userId=${kasir.id}&sortBy=startDate&limit=1`;
      const asc = await request(app.getHttpServer())
        .get(`${base}&sortOrder=asc`)
        .set('Cookie', owner.cookies)
        .expect(200);
      const desc = await request(app.getHttpServer())
        .get(`${base}&sortOrder=desc`)
        .set('Cookie', owner.cookies)
        .expect(200);

      const first = (asc.body as LeaveRequestListResponse).data[0];
      const last = (desc.body as LeaveRequestListResponse).data[0];
      expect(first.id).not.toBe(last.id);
      expect(first.startDate < last.startDate).toBe(true);
    });

    it('overlaps, not contains: a request spanning the month boundary appears in BOTH months', async () => {
      const november = await request(app.getHttpServer())
        .get(
          `/api/v1/leave-requests?userId=${kasir.id}&overlapsFrom=2027-11-01&overlapsTo=2027-11-30`,
        )
        .set('Cookie', owner.cookies)
        .expect(200);
      const novemberIds = (november.body as LeaveRequestListResponse).data.map(
        (r) => r.id,
      );

      const december = await request(app.getHttpServer())
        .get(
          `/api/v1/leave-requests?userId=${kasir.id}&overlapsFrom=2027-12-01&overlapsTo=2027-12-31`,
        )
        .set('Cookie', owner.cookies)
        .expect(200);
      const decemberIds = (december.body as LeaveRequestListResponse).data.map(
        (r) => r.id,
      );

      // The spanning request starts in November and ends in December, so it is
      // part of both months. A gte/lte on startDate alone would put it only in
      // November and silently drop it from the December calendar.
      expect(novemberIds).toContain(spanningId);
      expect(decemberIds).toContain(spanningId);

      // ...and the window still excludes what genuinely falls outside it.
      expect(novemberIds).toContain(earlyId);
      expect(novemberIds).not.toContain(lateId);
      expect(decemberIds).toContain(lateId);
      expect(decemberIds).not.toContain(earlyId);
    });

    it('reports totalPages 1 for an empty result rather than 0', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/leave-requests?userId=${kasir.id}&overlapsFrom=2035-01-01&overlapsTo=2035-01-31`,
        )
        .set('Cookie', owner.cookies)
        .expect(200);

      const body = res.body as LeaveRequestListResponse;
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
      expect(body.meta.totalPages).toBe(1);
    });
  });
});
