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

  /** PUT because the upsert is idempotent per (rawMaterialId, periodMonth). */
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
