import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { InventorySummaryQueryDto } from './inventory-summary.dto';
import { InventorySummaryService } from './inventory-summary.service';

/** No `BranchScopeGuard`: stock is one centralized pool (ADR-004). */
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
