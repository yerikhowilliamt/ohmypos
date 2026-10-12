import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchScopeGuard } from '../../common/guards/branch-scope.guard';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReqUser } from '../../common/decorators/req-user.decorator';
import { InsufficientStockException } from '../stock-movements/stock-movements.exceptions';
import { MetricsService } from '../metrics/metrics.service';
import { CreateSaleDto, SaleQueryDto } from './sales.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly metrics: MetricsService,
  ) {}

  /** The cashier is always the JWT subject; the body cannot name one. */
  @Post()
  @UseGuards(BranchScopeGuard, RoleGuard)
  @BranchScoped('body.branchId')
  @Roles('KASIR', 'ADMIN', 'OWNER')
  async create(
    @Body() dto: CreateSaleDto,
    @ReqUser('sub') userId: string,
    @ReqUser('role') role: string,
  ) {
    const stopTimer = this.metrics.saleDurationSeconds.startTimer();
    try {
      const result = await this.salesService.create(dto, userId, role);
      this.metrics.saleCreatedTotal.inc();
      return result;
    } catch (error) {
      if (error instanceof InsufficientStockException) {
        this.metrics.stockConflictTotal.inc();
      }
      throw error;
    } finally {
      stopTimer();
    }
  }

  @Get()
  @UseGuards(BranchScopeGuard)
  @BranchScoped('query.branchId')
  findAll(@Query() query: SaleQueryDto) {
    return this.salesService.findAll(query);
  }

  /** OWNER/ADMIN only: an id route cannot be branch-scoped without a lookup. */
  @Get(':id')
  @UseGuards(RoleGuard)
  @Roles('OWNER', 'ADMIN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findOne(id);
  }

  /** Voids a recent sale (DEBT-010). The voider is always the JWT subject. */
  @Post(':id/void')
  @UseGuards(RoleGuard)
  @Roles('ADMIN', 'OWNER')
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @ReqUser('sub') userId: string,
  ) {
    return this.salesService.void(id, userId);
  }
}
