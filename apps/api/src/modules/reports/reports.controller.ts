/**
 * OhMyPos — Reports controller, Dashboard 3 (PRD §5.4, System Design §5/§6.6,
 * ADR-011, Playbook §8).
 *
 * OWNER ONLY, on all six endpoints. System Design §5 gives ADMIN master-data
 * and reconciliation routes only, and §6.6 states outright that the reports
 * screen is OWNER-only in v1. Widening this is a documentation change first
 * (AGENTS.md), not a decorator edit.
 *
 * NO BranchScopeGuard — deliberate, not an omission. RoleGuard rejects KASIR
 * before branch scoping could ever apply, and `branchId` here is an optional
 * FILTER over historical data, not an attribution on a write. Same reasoning as
 * GET /supplier-purchases/:id and GET /sales/:id.
 *
 * `@Roles('OWNER')` is repeated on every handler rather than relying on a class
 * default, so `grep -rn "@Roles" src/modules/reports/` is a complete access
 * inventory (repo convention — sales.controller.ts:39).
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CashBalanceQueryDto,
  ReportRangeQueryDto,
  TopProductsQueryDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(RoleGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('profit-loss')
  @Roles('OWNER')
  profitLoss(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.profitLoss(query);
  }

  @Get('product-profit')
  @Roles('OWNER')
  productProfit(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.productProfit(query);
  }

  @Get('income-by-payment-method')
  @Roles('OWNER')
  incomeByPaymentMethod(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.incomeByPaymentMethod(query);
  }

  @Get('top-products')
  @Roles('OWNER')
  topProducts(@Query() query: TopProductsQueryDto) {
    return this.reportsService.topProducts(query);
  }

  @Get('daily-income')
  @Roles('OWNER')
  dailyIncome(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.dailyIncome(query);
  }

  @Get('cash-balance')
  @Roles('OWNER')
  cashBalance(@Query() query: CashBalanceQueryDto) {
    return this.reportsService.cashBalance(query);
  }
}
