import { Module } from '@nestjs/common';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { InventorySummaryController } from './inventory-summary.controller';
import { InventorySummaryService } from './inventory-summary.service';
import { OpeningStockController } from './opening-stock.controller';
import { OpeningStockService } from './opening-stock.service';

@Module({
  imports: [StockMovementsModule],
  controllers: [OpeningStockController, InventorySummaryController],
  providers: [OpeningStockService, InventorySummaryService],
  exports: [InventorySummaryService],
})
export class InventoryModule {}
