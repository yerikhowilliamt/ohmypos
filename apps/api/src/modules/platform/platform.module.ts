import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { ImpersonationService } from './impersonation.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantsService } from './platform-tenants.service';

/**
 * ADR-025 Fase 4 — the platform operator's API. Everything here is cross-tenant
 * and therefore runs on `UnscopedPrismaService`, with one deliberate exception:
 * `PlatformTenantsService` also injects the scoped client to provision a new
 * tenant's own rows inside `runWithTenant`.
 *
 * `PlatformAuthGuard` is provided here rather than registered globally, because
 * a global platform guard would have to decide per-request which of the two
 * identities applies — and that decision is the leak ADR-025 Decision 5 avoids.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [
    PlatformAuthGuard,
    PlatformAuthService,
    PlatformTenantsService,
    PlatformMetricsService,
    ImpersonationService,
  ],
  exports: [ImpersonationService],
})
export class PlatformModule {}
