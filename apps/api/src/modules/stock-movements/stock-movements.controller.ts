import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StockMovementQueryDto } from './stock-movements.dto';
import { StockMovementsService } from './stock-movements.service';

/**
 * Read-only stock history.
 *
 * No `BranchScopeGuard`: stock is one centralized pool (ADR-004), and `branchId`
 * is only an attribution filter.
 */
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
