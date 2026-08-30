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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReqUser } from '../../common/decorators/req-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  ResetUserPasswordDto,
  UpdateUserDto,
} from './users.dto';

/**
 * OWNER-only, with no exceptions and no approval workflow (ADR-011 §5).
 * The guard is applied at controller level so a method added later inherits the
 * restriction rather than silently defaulting to open.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(RoleGuard)
@Roles('OWNER')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a staff user (OWNER only)' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 403, description: 'Caller is not an OWNER' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List staff users (OWNER only)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one staff user (OWNER only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a staff user (OWNER only)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a user and end their session (OWNER only)',
  })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a user (OWNER only)' })
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.reactivate(id);
  }

  /**
   * TASK-130. `@Roles('OWNER')` is not repeated here — it is on the class
   * above, which is why a route added later inherits it.
   */
  @Patch(':id/password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary:
      "Reset a staff member's password; revokes all their sessions. Cannot be used on yourself.",
  })
  @ApiResponse({
    status: 400,
    description: 'Caller targeted their own account',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an OWNER' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @ReqUser('sub') actorId: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.usersService.resetPassword(id, actorId, dto);
  }
}
