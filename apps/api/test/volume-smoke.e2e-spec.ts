import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantScopedPrisma } from './tenant-fixture';
import { resetDatabase } from './reset-database';

/**
 * TASK-099 / P0-5: Load & volume benchmark on proposed matches, reports, and inventory summary.
 */
describe('Load & Volume Smoke Test (e2e - TASK-099)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerCookies: string[];
  let branchId: string;
  let accountId: string;

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

    const hash = await bcrypt.hash('Password123!', 10);
    const branch = await prisma.branch.create({
      data: { name: 'Benchmark Branch' },
    });
    branchId = branch.id;

    const account = await prisma.account.create({
      data: { name: 'Benchmark Bank', type: 'BANK' },
    });
    accountId = account.id;

    const category = await prisma.category.create({
      data: { name: 'Benchmark Income', type: 'INFLOW' },
    });

    await prisma.user.create({
      data: {
        name: 'Benchmark Owner',
        email: 'owner-bench@test.local',
        passwordHash: hash,
        role: 'OWNER',
        tokenValidFrom: new Date(),
      },
    });

    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner-bench@test.local', password: 'Password123!' })
      .expect(200);
    ownerCookies = ownerRes.get('Set-Cookie') ?? [];

    // Seed 500 ledger entries & 20 unresolved bank transactions
    const ledgerData = [];
    const date = new Date('2026-08-01');
    for (let i = 0; i < 500; i++) {
      ledgerData.push({
        accountId,
        categoryId: category.id,
        branchId,
        entryDate: date,
        amount: '10000.00',
        type: 'INFLOW' as const,
      });
    }
    await prisma.ledgerEntry.createMany({ data: ledgerData });

    const bankData = [];
    for (let i = 0; i < 20; i++) {
      bankData.push({
        accountId,
        txnDate: date,
        amount: '10000.00',
        type: 'INFLOW' as const,
        description: `Txn ${i}`,
        status: 'UNRESOLVED' as const,
      });
    }
    await prisma.bankTransaction.createMany({ data: bankData });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('POST /matching/propose executes within SLO (< 5000ms)', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/v1/matching/propose')
      .set('Cookie', ownerCookies)
      .send({ accountId, maxAggregationSubsetSize: 4, dateToleranceDays: 3 })
      .expect(200);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    expect(res.body).toHaveProperty('candidates');
    expect(res.body).toHaveProperty('truncated');
  });

  it('GET /reports/profit-loss executes within SLO (< 2000ms)', async () => {
    const start = Date.now();
    await request(app.getHttpServer())
      .get(
        '/api/v1/reports/profit-loss?startDate=2026-08-01&endDate=2026-08-31',
      )
      .set('Cookie', ownerCookies)
      .expect(200);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it('GET /inventory/summary executes within SLO (< 2000ms)', async () => {
    const start = Date.now();
    await request(app.getHttpServer())
      .get('/api/v1/inventory/summary?period=2026-08')
      .set('Cookie', ownerCookies)
      .expect(200);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});
