import { Global, Module } from '@nestjs/common';
import { PrismaService, UnscopedPrismaService } from './prisma.service';
import { tenantExtension } from './tenant.extension';

/** Two DI tokens over one connection pool: tenant-filtered and unscoped. */
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
