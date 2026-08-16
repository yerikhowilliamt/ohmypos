import { z } from 'zod';
import {
  DateTimeString,
  MoneyString,
  QuantityString,
  UuidString,
} from './primitives';
import { StockDirection, StockReferenceType } from './enums';

/**
 * OhMyPos — StockMovement response contract (ERD §3, System Design §7, ADR-007).
 * No write endpoint exists in Phase 4 — StockMovement is created exclusively
 * via transaction-participant services (StockMovementsService).
 */
export const StockMovementResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  branchId: UuidString.nullable(),
  direction: StockDirection,
  quantity: QuantityString,
  referenceType: StockReferenceType,
  referenceId: z.string().nullable(),
  unitCostAtMovement: MoneyString,
  movementDate: DateTimeString,
  createdAt: DateTimeString,
});
export type StockMovementResponse = z.infer<typeof StockMovementResponseSchema>;
