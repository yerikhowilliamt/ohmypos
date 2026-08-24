/**
 * OhMyPos — SupplierPurchases controller (ERD §3, System Design §6.2, Playbook §8).
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
import {
  CreateSupplierPurchaseDto,
  SupplierPurchaseQueryDto,
} from './supplier-purchases.dto';
import { SupplierPurchasesService } from './supplier-purchases.service';

@Controller('supplier-purchases')
export class SupplierPurchasesController {
  constructor(
    private readonly supplierPurchasesService: SupplierPurchasesService,
  ) {}

  /**
   * Central-purchase policy (PRD §8.4, plan §6.6b):
   * - ADMIN / OWNER bypass BranchScopeGuard and may create central purchases (branchId: null)
   *   or branch-scoped purchases.
   * - KASIR is checked by BranchScopeGuard: null, undefined, or other branch IDs fail closed
   *   with 403 Forbidden. Kasir can only record incidental purchases for their own assigned branch.
   */
  @Post()
  @UseGuards(BranchScopeGuard)
  @BranchScoped('body.branchId')
  create(
    @Body() dto: CreateSupplierPurchaseDto,
    @ReqUser('role') role: string,
  ) {
    return this.supplierPurchasesService.create(dto, role);
  }

  @Get()
  @UseGuards(BranchScopeGuard)
  @BranchScoped('query.branchId')
  findAll(@Query() query: SupplierPurchaseQueryDto) {
    return this.supplierPurchasesService.findAll(query);
  }

  /**
   * GET /supplier-purchases/:id is role-restricted to OWNER and ADMIN (plan §6.6a).
   * A detail route carries params.id (the purchase ID), not a branchId.
   * BranchScopeGuard cannot inspect the branch without an extra DB lookup.
   * KASIR lists their branch purchases via GET /supplier-purchases?branchId=<own>,
   * which includes full line item details.
   */
  @Get(':id')
  @UseGuards(RoleGuard)
  @Roles('OWNER', 'ADMIN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierPurchasesService.findOne(id);
  }
}
