import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MetricsService } from './metrics.service';

/**
 * TASK-095: Secured to OWNER only, eliminating information leak of business metrics.
 */
@Controller('metrics')
@UseGuards(RoleGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Roles('OWNER')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): Promise<string> {
    return this.metricsService.metrics();
  }
}
