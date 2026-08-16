/**
 * OhMyPos — StockMovements module (ERD §3, System Design §7, ADR-007).
 *
 * Transaction-participant service with no HTTP surface in Phase 4 (plan §6.4).
 * StockMovement read endpoints belong to Dashboard 5 in Phase 6.
 */
import { Module } from '@nestjs/common';
import { StockMovementsService } from './stock-movements.service';

@Module({
  controllers: [], // Deliberate: no controller in Phase 4 (§6.4)
  providers: [StockMovementsService],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
