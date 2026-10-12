import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { ImpersonationReadOnlyGuard } from './common/guards/impersonation-read-only.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RoleGuard } from './common/guards/role.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TenantScopeMiddleware } from './common/middleware/tenant-scope.middleware';
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
import { BusinessProfileModule } from './modules/business-profile/business-profile.module';
import { PlatformModule } from './modules/platform/platform.module';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Separate platform key pair (ADR-025); required so a missing one fails at boot.
  PLATFORM_JWT_SECRET: z.string().min(32),
  PLATFORM_JWT_REFRESH_SECRET: z.string().min(32),
  DEVICE_COOKIE_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
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
        // Never log bodies: they carry financial data (Playbook §9).
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          // Redact the PDF unlock `?password=` from logged URLs (`redact` covers headers only).
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
    // THROTTLE_LIMIT is raised only in .env.test for the concurrency suite.
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
    BusinessProfileModule,
    PlatformModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: this array's order is execution order (see common/README.md).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must precede TenantStatusGuard, whose impersonation exemption relies on it.
    { provide: APP_GUARD, useClass: ImpersonationReadOnlyGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    // Validates every body/query against its Zod schema (ADR-010).
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Middleware always runs before guards, so the tenant scope is open for JwtAuthGuard.
    consumer
      .apply(TenantScopeMiddleware, CorrelationIdMiddleware)
      .forRoutes('*');
  }
}
