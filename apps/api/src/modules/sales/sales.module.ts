/**
 * OhMyPos — Sales module (ERD §3, System Design §6.1).
 */
import { Module } from '@nestjs/common';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { LedgerEntriesModule } from '../ledger-entries/ledger-entries.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [StockMovementsModule, LedgerEntriesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
