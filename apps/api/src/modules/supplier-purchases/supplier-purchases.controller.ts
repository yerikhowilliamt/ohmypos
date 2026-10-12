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

  /** KASIR may record purchases for their own branch only; central (null) is ADMIN/OWNER. */
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

  /** OWNER/ADMIN only: an id route cannot be branch-scoped without a lookup. */
  @Get(':id')
  @UseGuards(RoleGuard)
  @Roles('OWNER', 'ADMIN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierPurchasesService.findOne(id);
  }
}
