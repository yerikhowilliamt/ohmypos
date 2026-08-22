import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * Not exposed publicly in a real deployment without network-level
 * restriction (reverse-proxy allowlist or a separate internal port) — that
 * is infrastructure, not application code, and is out of this phase's scope.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): Promise<string> {
    return this.metricsService.metrics();
  }
}
