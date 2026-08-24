import {
  Body,
  Controller,
  Delete,
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
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { BranchScopeGuard } from '../../common/guards/branch-scope.guard';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReqUser } from '../../common/decorators/req-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { LedgerEntriesService } from './ledger-entries.service';
import {
  CreateLedgerEntryDto,
  LedgerEntryQueryDto,
  UpdateLedgerEntryDto,
} from './ledger-entries.dto';

/**
 * Ledger entries carry a branch, so KASIR access is scoped to their own branch
 * (ADR-011 §4). ADMIN and OWNER pass through unscoped. Each endpoint declares
 * where its branch id lives rather than letting the guard guess.
 *
 * DEF-QA-01: `:id` routes have no body/query field the guard can read a
 * branch id from, so `GET :id` enforces branch ownership in the service once
 * the entry (and its branchId) is known, and `PATCH`/`DELETE :id` are
 * restricted to OWNER/ADMIN outright — a manual ledger entry is a
 * back-office correction, never a cashier action.
 */
@ApiTags('ledger-entries')
@Controller('ledger-entries')
@UseGuards(BranchScopeGuard, RoleGuard)
export class LedgerEntriesController {
  constructor(private readonly ledgerEntriesService: LedgerEntriesService) {}

  @Post()
  @BranchScoped('body.branchId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a manual ledger entry' })
  @ApiResponse({ status: 201, description: 'Ledger entry created' })
  @ApiResponse({
    status: 404,
    description: 'Account, category or branch not found',
  })
  create(@Body() dto: CreateLedgerEntryDto) {
    return this.ledgerEntriesService.create(dto);
  }

  @Get()
  @BranchScoped('query.branchId')
  @ApiOperation({ summary: 'List ledger entries (paginated, filterable)' })
  findAll(@Query() query: LedgerEntryQueryDto) {
    return this.ledgerEntriesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one ledger entry' })
  @ApiResponse({
    status: 403,
    description: 'A KASIR may only read an entry from their own branch',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqUser() user: JwtPayload) {
    return this.ledgerEntriesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update a manual ledger entry' })
  @ApiResponse({
    status: 409,
    description: 'Entry was system-generated and is not editable',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLedgerEntryDto,
  ) {
    return this.ledgerEntriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Delete a ledger entry' })
  @ApiResponse({ status: 409, description: 'Entry still has allocations' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ledgerEntriesService.remove(id);
  }
}
