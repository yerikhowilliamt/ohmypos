/**
 * OhMyPos — OpeningStock controller (PRD §5.5, Playbook §8, Phase 6 plan §8.3).
 */
import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  OpeningStockPeriodQueryDto,
  UpsertOpeningStockDto,
} from './opening-stock.dto';
import { OpeningStockService } from './opening-stock.service';

@Controller('inventory/opening-stock')
export class OpeningStockController {
  constructor(private readonly openingStockService: OpeningStockService) {}

  /**
   * OWNER only. System Design §5 gives ADMIN the master-data and reconciliation
   * routes and nothing else, and inventory is neither — so ADMIN is rejected
   * here as deliberately as KASIR is. Widening this is a documentation change
   * first (AGENTS.md), never a guard tweak.
   *
   * PUT, not POST: the operation is idempotent per (rawMaterialId, periodMonth)
   * — the same body sent twice computes a zero delta and leaves the same state
   * (plan §6, §7.1). There is no separate "update" route to keep in sync.
   */
  @Put()
  @UseGuards(RoleGuard)
  @Roles('OWNER')
  upsert(@Body() dto: UpsertOpeningStockDto) {
    return this.openingStockService.upsert(dto);
  }

  @Get()
  @UseGuards(RoleGuard)
  @Roles('OWNER')
  findWorksheet(@Query() query: OpeningStockPeriodQueryDto) {
    return this.openingStockService.findWorksheet(query);
  }
}
