import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RoleGuard } from './common/guards/role.guard';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AuthModule } from './modules/auth/auth.module';
import { AllocationModule } from './modules/allocation/allocation.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DevicesModule } from './modules/devices/devices.module';
import { LeaveRequestsModule } from './modules/leave-requests/leave-requests.module';
import { ImportModule } from './modules/import/import.module';
import { LedgerEntriesModule } from './modules/ledger-entries/ledger-entries.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { UsersModule } from './modules/users/users.module';
import { RawMaterialsModule } from './modules/raw-materials/raw-materials.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { ProductsModule } from './modules/products/products.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { StockMovementsModule } from './modules/stock-movements/stock-movements.module';
import { SupplierPurchasesModule } from './modules/supplier-purchases/supplier-purchases.module';
import { PayablesModule } from './modules/payables/payables.module';
import { SalesModule } from './modules/sales/sales.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportsModule } from './modules/reports/reports.module';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  DEVICE_COOKIE_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().optional(),
  PORT: z.coerce.number().int().optional(),
  THROTTLE_LIMIT: z.coerce.number().int().optional(),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => EnvSchema.parse(config),
      envFilePath:
        process.env.NODE_ENV === 'production' ? '.env' : ['.env.local', '.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) =>
          (req.headers['x-correlation-id'] as string) || randomUUID(),
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        // Never log request/response bodies — they carry financial data (Playbook §9).
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          // Phase 14 E-5 audit finding: `password` on POST
          // /import/pdf/:accountId?password=... (import.controller.ts) is a
          // query-string field, not a header — pino's default `req`
          // serializer logs the full URL including the query string, so
          // `redact` above (which only reaches header paths) never touched
          // it. A locked statement's unlock password was going to the log
          // in plaintext on every import. Wraps the standard serializer
          // (rather than replacing it) so headers/remoteAddress/etc. are
          // still logged exactly as before — only `url` is touched.
          req: pino.stdSerializers.wrapRequestSerializer((req) => {
            const url = new URL(req.raw.url ?? '', 'http://internal');
            if (url.searchParams.has('password')) {
              url.searchParams.set('password', '[Redacted]');
            }
            req.url = url.pathname + url.search;
            return req;
          }),
        },
      },
    }),
    // `limit` is env-configurable, defaulting to the unchanged production
    // value of 100. Phase 14's concurrency e2e suite (B1-B4) legitimately
    // fires well over 100 requests from one IP inside a 60s window — the
    // e2e-only .env.test raises THROTTLE_LIMIT so those tests measure lock
    // contention and pool exhaustion, not this guard.
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: Number(process.env.THROTTLE_LIMIT ?? 100) },
    ]),
    PrismaModule,
    HealthModule,
    MetricsModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    BranchesModule,
    DevicesModule,
    LeaveRequestsModule,
    LedgerEntriesModule,
    ImportModule,
    AllocationModule,
    MatchingModule,
    ReconciliationModule,
    RawMaterialsModule,
    RecipesModule,
    ProductsModule,
    SuppliersModule,
    StockMovementsModule,
    SupplierPurchasesModule,
    PayablesModule,
    SalesModule,
    InventoryModule,
    ReportsModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Registered globally so every endpoint is authenticated by default; an
    // endpoint opts out only with an explicit @Public() (Playbook §8).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Registered globally so every endpoint checks @Roles(...) declarations (ADR-011).
    { provide: APP_GUARD, useClass: RoleGuard },
    // Every request body/query is validated against its Zod schema from
    // packages/api-contracts before it reaches a service (ADR-010, Playbook §4).
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
