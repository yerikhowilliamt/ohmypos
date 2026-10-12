import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CashBalanceQueryDto,
  ReportRangeQueryDto,
  TopProductsQueryDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

/**
 * Dashboard 3 reports, `OWNER` only. No `BranchScopeGuard`: `branchId` is a
 * read filter, not a write attribution.
 */
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
