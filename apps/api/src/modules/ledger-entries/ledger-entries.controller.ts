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
 */
@ApiTags('ledger-entries')
@Controller('ledger-entries')
@UseGuards(BranchScopeGuard)
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ledgerEntriesService.findOne(id);
  }

  @Patch(':id')
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
  @ApiOperation({ summary: 'Delete a ledger entry' })
  @ApiResponse({ status: 409, description: 'Entry still has allocations' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ledgerEntriesService.remove(id);
  }
}
