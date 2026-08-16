/**
 * OhMyPos — SupplierPurchases module (ERD §3, System Design §6.2).
 */
import { Module } from '@nestjs/common';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { LedgerEntriesModule } from '../ledger-entries/ledger-entries.module';
import { SupplierPurchasesController } from './supplier-purchases.controller';
import { SupplierPurchasesService } from './supplier-purchases.service';

@Module({
  imports: [StockMovementsModule, LedgerEntriesModule],
  controllers: [SupplierPurchasesController],
  providers: [SupplierPurchasesService],
  exports: [SupplierPurchasesService],
})
export class SupplierPurchasesModule {}
