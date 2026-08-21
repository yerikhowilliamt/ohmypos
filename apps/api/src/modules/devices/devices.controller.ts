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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  COOKIE_OPTIONS,
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
} from '../../common/constants/cookie.constants';
import { ReqUser } from '../../common/decorators/req-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { AttendanceService } from './attendance.service';
import { DevicesService } from './devices.service';
import {
  ActivateDeviceDto,
  AttendanceQueryDto,
  CreateDeviceDto,
  UpdateAttendanceStatusDto,
} from './devices.dto';

/**
 * OWNER-only throughout, including activation (Context section — this
 * corrects the original master plan's `@Public()` sketch: an unauthenticated
 * activation endpoint would defeat the "physical Owner ceremony" premise).
 */
@ApiTags('devices')
@Controller('devices')
@UseGuards(RoleGuard)
@Roles('OWNER')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly attendanceService: AttendanceService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new terminal, pending activation (OWNER only)',
  })
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all terminals (OWNER only)' })
  findAll() {
    return this.devicesService.findAll();
  }

  @Get('attendance')
  @ApiOperation({
    summary: 'List attendance and device login records (OWNER only)',
  })
  findAttendance(@Query() query: AttendanceQueryDto) {
    return this.attendanceService.findRecords(query);
  }

  @Patch('attendance/:id')
  @ApiOperation({
    summary: 'Override or correct attendance validity status (OWNER only)',
  })
  updateAttendanceStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceStatusDto,
  ) {
    return this.attendanceService.updateStatus(id, dto);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Complete activation from the physical terminal's own browser (OWNER only)",
  })
  @ApiResponse({ status: 404, description: 'Invalid or already-used code' })
  @ApiResponse({ status: 400, description: 'Code has expired' })
  async activate(
    @Body() dto: ActivateDeviceDto,
    @ReqUser('sub') activatingUserId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { device, cookieValue } = await this.devicesService.activate(
      dto.code,
      activatingUserId,
    );
    res.cookie(DEVICE_COOKIE, cookieValue, {
      ...COOKIE_OPTIONS,
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
    return device;
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a terminal (OWNER only)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.devicesService.deactivate(id);
  }
}
