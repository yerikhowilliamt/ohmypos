import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { AllocationService } from './allocation.service';
import { CreateAllocationDto } from './allocation.dto';

/**
 * Reconciliation matching — restricted to ADMIN and OWNER; KASIR is rejected
 * outright (ADR-011 §6, Playbook §8). The guard sits on the controller so the
 * read endpoints are covered too: a cashier has no reason to inspect how bank
 * money was allocated across branches.
 */
@ApiTags('allocations')
@Controller('allocations')
@UseGuards(RoleGuard)
@Roles('ADMIN', 'OWNER')
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Allocate bank transaction amount to ledger entries',
  })
  @ApiResponse({ status: 201, description: 'Allocation(s) created' })
  @ApiResponse({
    status: 400,
    description: 'Allocation would exceed the transaction amount',
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction or ledger entry not found',
  })
  create(@Body() dto: CreateAllocationDto) {
    return this.allocationService.create(dto);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an allocation' })
  @ApiResponse({ status: 404, description: 'Allocation not found' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.allocationService.revoke(id);
  }

  @Get('transaction/:txnId')
  @ApiOperation({ summary: 'List allocations for a bank transaction' })
  findByTransaction(@Param('txnId', ParseUUIDPipe) txnId: string) {
    return this.allocationService.findByTransaction(txnId);
  }

  @Get('ledger-entry/:ledgerEntryId')
  @ApiOperation({ summary: 'List allocations for a ledger entry' })
  findByLedgerEntry(
    @Param('ledgerEntryId', ParseUUIDPipe) ledgerEntryId: string,
  ) {
    return this.allocationService.findByLedgerEntry(ledgerEntryId);
  }
}
