import { Global, Module } from '@nestjs/common';
import { PrismaService, UnscopedPrismaService } from './prisma.service';
import { tenantExtension } from './tenant.extension';

/**
 * ADR-025 Fase 2 — two tokens over ONE connection pool.
 *
 * `PrismaService` is the extended, tenant-filtered client; because it is
 * provided under the same token the 25 existing modules already inject, none of
 * them changed. `UnscopedPrismaService` is the raw client, and asking for it is
 * meant to be conspicuous (see the doc comment on the class).
 */
@Global()
@Module({
  providers: [
    UnscopedPrismaService,
    {
      provide: PrismaService,
      useFactory: (base: UnscopedPrismaService) =>
        base.$extends(tenantExtension),
      inject: [UnscopedPrismaService],
    },
  ],
  exports: [PrismaService, UnscopedPrismaService],
})
export class PrismaModule {}
