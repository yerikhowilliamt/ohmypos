/**
 * OhMyPos — Inventory Summary controller (PRD §5.6, Playbook §8, Phase 6 plan §8.3).
 *
 * There is deliberately no BranchScopeGuard here and no branchId query
 * parameter: stock is a single centralized pool (ADR-004), so a branch-filtered
 * opening balance does not exist to be scoped (plan §7.4).
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { InventorySummaryQueryDto } from './inventory-summary.dto';
import { InventorySummaryService } from './inventory-summary.service';

@Controller('inventory/summary')
export class InventorySummaryController {
  constructor(
    private readonly inventorySummaryService: InventorySummaryService,
  ) {}

  @Get()
  @UseGuards(RoleGuard)
  @Roles('OWNER')
  findByPeriod(@Query() query: InventorySummaryQueryDto) {
    return this.inventorySummaryService.findByPeriod(query);
  }
}
