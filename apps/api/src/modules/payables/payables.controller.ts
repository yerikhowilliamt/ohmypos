/**
 * OhMyPos — Payables controller (ERD §3, System Design §5, Playbook §8).
 *
 * RBAC:
 * - List and detail viewing: OWNER and ADMIN.
 * - Settlements creation: OWNER only (decision 5: money leaving central account).
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
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePayableSettlementDto, PayableQueryDto } from './payables.dto';
import { PayablesService } from './payables.service';

@Controller('payables')
@UseGuards(RoleGuard)
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Get('summary')
  @Roles('OWNER', 'ADMIN')
  getSummary() {
    return this.payablesService.getSupplierSummary();
  }

  @Get()
  @Roles('OWNER', 'ADMIN')
  findAll(@Query() query: PayableQueryDto) {
    return this.payablesService.findAll(query);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payablesService.findOne(id);
  }

  @Post(':id/settlements')
  @Roles('OWNER')
  settle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePayableSettlementDto,
  ) {
    return this.payablesService.settle(id, dto);
  }
}
