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
import {
  PayableSortBySchema,
  SaleSortBySchema,
  SupplierPurchaseSortBySchema,
  SupplierSortBySchema,
  StockMovementSortBySchema,
  LedgerEntrySortBySchema,
  LeaveRequestSortBySchema,
  AttendanceSortBySchema,
  ReconciliationSortBySchema,
} from '@ohmypos/api-contracts';

/**
 * TASK-086 / DEF-A7: Ensure every sortBy enum member produces valid SQL/queries
 * across all paginated endpoints without throwing 5xx.
 */
describe('Sort Contract (e2e - TASK-086)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerCookies: string[];

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

    const hash = await bcrypt.hash('Password123!', 10);
    await prisma.user.create({
      data: {
        name: 'Sort Test Owner',
        email: 'owner-sort@test.local',
        passwordHash: hash,
        role: 'OWNER',
        tokenValidFrom: new Date(),
      },
    });

    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner-sort@test.local', password: 'Password123!' })
      .expect(200);
    ownerCookies = ownerRes.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const testSortOptions = (
    endpoint: string,
    schema: { options: readonly string[] },
  ) => {
    for (const sortKey of schema.options) {
      it(`GET ${endpoint}?sortBy=${sortKey} does not return 5xx`, async () => {
        const res = await request(app.getHttpServer())
          .get(`${endpoint}?sortBy=${sortKey}&limit=5`)
          .set('Cookie', ownerCookies);

        expect(res.status).toBeLessThan(500);
      });
    }
  };

  describe('/api/v1/payables', () => {
    testSortOptions('/api/v1/payables', PayableSortBySchema);
  });

  describe('/api/v1/sales', () => {
    testSortOptions('/api/v1/sales', SaleSortBySchema);
  });

  describe('/api/v1/supplier-purchases', () => {
    testSortOptions('/api/v1/supplier-purchases', SupplierPurchaseSortBySchema);
  });

  describe('/api/v1/suppliers', () => {
    testSortOptions('/api/v1/suppliers', SupplierSortBySchema);
  });

  describe('/api/v1/stock-movements', () => {
    testSortOptions('/api/v1/stock-movements', StockMovementSortBySchema);
  });

  describe('/api/v1/ledger-entries', () => {
    testSortOptions('/api/v1/ledger-entries', LedgerEntrySortBySchema);
  });

  describe('/api/v1/leave-requests', () => {
    testSortOptions('/api/v1/leave-requests', LeaveRequestSortBySchema);
  });

  describe('/api/v1/devices/attendance', () => {
    testSortOptions('/api/v1/devices/attendance', AttendanceSortBySchema);
  });

  describe('/api/v1/reconciliation/transactions', () => {
    testSortOptions(
      '/api/v1/reconciliation/transactions',
      ReconciliationSortBySchema,
    );
  });
});
