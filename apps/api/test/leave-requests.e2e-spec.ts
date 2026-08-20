import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { LeaveRequestResponse } from '@ohmypos/api-contracts';
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

    const list = listRes.body as LeaveRequestResponse[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    const target = list.find((r) => r.userId === kasir.id);
    expect(target).toBeDefined();
    expect(target?.status).toBe('PENDING');

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
});
