import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { ImpersonationService } from './impersonation.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantsService } from './platform-tenants.service';

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
