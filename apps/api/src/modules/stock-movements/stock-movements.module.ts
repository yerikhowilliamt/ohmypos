/**
 * OhMyPos — StockMovements module (ERD §3, System Design §7, ADR-007).
 *
 * Phase 4 shipped this as a transaction-participant service with no HTTP
 * surface, deferring reads to "Dashboard 5 in Phase 6". Phase 6 built the
 * AGGREGATE (GET /inventory/summary) but never the row-level log behind it, so
 * TASK-070 adds the read half here. Writes stay service-only: every movement is
 * still created inside a caller's transaction, never over HTTP.
 */
import { Module } from '@nestjs/common';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';

@Module({
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
