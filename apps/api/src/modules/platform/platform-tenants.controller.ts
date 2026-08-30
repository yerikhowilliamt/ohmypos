import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ReqPlatformAdmin } from '../../common/decorators/req-platform-admin.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { ImpersonationService } from './impersonation.service';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformTenantsService } from './platform-tenants.service';
import {
  CreateTenantDto,
  StartImpersonationDto,
  TenantListQueryDto,
  UpdateTenantDto,
} from './platform.dto';

/**
 * ADR-025 Fase 4. `@Public()` bypasses the tenant `JwtAuthGuard`;
 * `PlatformAuthGuard` at class level is what actually authenticates every route
 * here. Both decorators are required — see DEBT-066.
 */
@ApiTags('platform')
@Controller('platform')
@Public()
@UseGuards(PlatformAuthGuard)
export class PlatformTenantsController {
  constructor(
    private readonly tenantsService: PlatformTenantsService,
    private readonly metricsService: PlatformMetricsService,
    private readonly impersonationService: ImpersonationService,
  ) {}

  // Declared before `tenants/:id` so the literal path cannot be captured by the
  // parameterised one.
  @Get('metrics/overview')
  @ApiOperation({ summary: 'Cross-tenant totals for the platform dashboard' })
  getMetrics() {
    return this.metricsService.overview();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants, newest first' })
  findAll(@Query() query: TenantListQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provision a tenant with its system refs and first OWNER',
  })
  @ApiResponse({
    status: 409,
    description: 'Slug or owner email already taken',
  })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'One tenant with its usage figures' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch('tenants/:id')
  @ApiOperation({ summary: 'Rename a tenant, or suspend/reactivate it' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Get('tenants/:id/impersonations')
  @ApiOperation({ summary: 'The audit trail of who looked inside this tenant' })
  listImpersonations(@Param('id', ParseUUIDPipe) id: string) {
    return this.impersonationService.listForTenant(id);
  }

  @Post('tenants/:id/impersonate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mint a 30-minute READ-ONLY tenant token for this tenant’s OWNER',
  })
  @ApiResponse({ status: 409, description: 'Tenant has no active OWNER' })
  impersonate(
    @ReqPlatformAdmin('sub') platformAdminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartImpersonationDto,
  ) {
    return this.impersonationService.start(platformAdminId, id, dto);
  }

  @Post('impersonation/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close your most recent open impersonation session',
  })
  @ApiResponse({ status: 404, description: 'No open session' })
  endImpersonation(@ReqPlatformAdmin('sub') platformAdminId: string) {
    return this.impersonationService.end(platformAdminId);
  }
}
