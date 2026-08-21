import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RoleGuard } from './common/guards/role.guard';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { AccountsModule } from './modules/accounts/accounts.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
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
