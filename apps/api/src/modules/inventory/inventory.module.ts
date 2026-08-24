/**
 * OhMyPos — Inventory module (PRD §5.5, §5.6, System Design §6.4, §6.6).
 *
 * Opening stock and the summary are one domain: the summary reads exactly the
 * movements the opening writer creates, and both resolve periods through the
 * same period.ts.
 */
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
  // Phase 7's reports will read the summary; nothing else does yet.
  exports: [InventorySummaryService],
})
export class InventoryModule {}
