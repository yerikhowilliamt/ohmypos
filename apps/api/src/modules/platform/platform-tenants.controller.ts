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
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ReqPlatformAdmin } from '../../common/decorators/req-platform-admin.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { ImpersonationService } from './impersonation.service';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformTenantsService } from './platform-tenants.service';
import {
  CreateTenantDto,
  ResetTenantOwnerPasswordDto,
  StartImpersonationDto,
  TenantListQueryDto,
  UpdateTenantDto,
  UpdateTenantOwnerEmailDto,
} from './platform.dto';

/**
 * Platform operator API. `@Public()` bypasses the tenant guard; the class-level
 * `PlatformAuthGuard` authenticates every route. Add new platform routes here
 * so they inherit the guard (DEBT-066).
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

  // Must stay above `tenants/:id`.
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

  @Post('tenants/:id/reset-owner-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary:
      "Reset a tenant OWNER's password; revokes all their sessions. Requires a reason.",
  })
  @ApiResponse({ status: 404, description: 'No such tenant, or no such OWNER' })
  resetOwnerPassword(
    @ReqPlatformAdmin('sub') platformAdminId: string,
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: ResetTenantOwnerPasswordDto,
  ) {
    return this.tenantsService.resetOwnerPassword(
      tenantId,
      platformAdminId,
      dto,
    );
  }

  @Patch('tenants/:id/owner-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary:
      "Change a tenant OWNER's login email; revokes all their sessions. Requires a reason.",
  })
  @ApiResponse({ status: 404, description: 'No such tenant, or no such OWNER' })
  @ApiResponse({
    status: 409,
    description:
      'Email already used by another user, or tenant already holds data and the caller did not acknowledge it',
  })
  updateOwnerEmail(
    @ReqPlatformAdmin('sub') platformAdminId: string,
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantOwnerEmailDto,
  ) {
    return this.tenantsService.updateOwnerEmail(tenantId, platformAdminId, dto);
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
