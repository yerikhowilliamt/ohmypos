/**
 * OhMyPos — StockMovements read controller (ERD §3, PRD §5.6, Playbook §8).
 *
 * Read-only by construction — see stock-movements.dto.ts.
 *
 * No BranchScopeGuard and no branch-scoped read, for the same reason
 * InventorySummaryController has none: stock is a single centralized pool
 * (ADR-004), so a branch-partitioned stock history does not exist to be scoped.
 * `branchId` appears only as an ATTRIBUTION filter — "which outlet triggered
 * this" — and OWNER, the only role that reaches this route, sees every branch
 * by definition (ADR-011).
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StockMovementQueryDto } from './stock-movements.dto';
import { StockMovementsService } from './stock-movements.service';

@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Get()
  @UseGuards(RoleGuard)
  @Roles('OWNER')
  findAll(@Query() query: StockMovementQueryDto) {
    return this.stockMovementsService.findAll(query);
  }
}
