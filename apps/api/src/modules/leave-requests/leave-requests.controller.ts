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
import { ReqUser } from '../../common/decorators/req-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { LeaveRequestsService } from './leave-requests.service';
import {
  CreateLeaveRequestDto,
  LeaveRequestListQueryDto,
} from './leave-requests.dto';

@ApiTags('leave-requests')
@Controller('leave-requests')
@UseGuards(RoleGuard)
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a leave request for yourself' })
  create(@ReqUser('sub') userId: string, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequestsService.create(userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List your own leave requests, any status' })
  findMine(@ReqUser('sub') userId: string) {
    return this.leaveRequestsService.findMine(userId);
  }

  @Get()
  @Roles('OWNER')
  @ApiOperation({
    summary: 'List every leave request, optionally filtered (OWNER only)',
  })
  findAll(@Query() query: LeaveRequestListQueryDto) {
    return this.leaveRequestsService.findAll(query);
  }

  @Patch(':id/approve')
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending leave request (OWNER only)' })
  @ApiResponse({ status: 400, description: 'Already reviewed' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @ReqUser('sub') reviewerId: string,
  ) {
    return this.leaveRequestsService.approve(id, reviewerId);
  }

  @Patch(':id/reject')
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending leave request (OWNER only)' })
  @ApiResponse({ status: 400, description: 'Already reviewed' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @ReqUser('sub') reviewerId: string,
  ) {
    return this.leaveRequestsService.reject(id, reviewerId);
  }
}
