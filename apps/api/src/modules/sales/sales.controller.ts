/**
 * OhMyPos — Sales controller (ERD §3, System Design §6.1, Playbook §8, plan §7.3).
 */
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

  /**
   * `@Roles` lists all three roles explicitly (plan §1 decision 6) — the effect
   * equals the RoleGuard default, but Playbook §8's rule is that access is
   * "verified, not assumed", and this makes `grep -rn "@Roles"` a complete
   * inventory of who can do what.
   *
   * `userId` comes from the JWT, never the request body — CreateSaleSchema has
   * no `userId` field at all, so a client cannot even attempt to attribute a
   * sale to another cashier (Sale.userId is an audit trail per ADR-011).
   */
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

  /**
   * Role-restricted to OWNER and ADMIN, mirroring GET /supplier-purchases/:id
   * (Phase 4 §6.6a): a detail route carries a sale id, not a branch id, so
   * BranchScopeGuard cannot scope it without an extra lookup. A KASIR gets the
   * full sale from the POST response and from GET /sales?branchId=<own>, so
   * nothing they need is behind this route.
   */
  @Get(':id')
  @UseGuards(RoleGuard)
  @Roles('OWNER', 'ADMIN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findOne(id);
  }
}
