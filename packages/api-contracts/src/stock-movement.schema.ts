import { z } from 'zod';
import {
  DateTimeString,
  MoneyString,
  QuantityString,
  UuidString,
} from './primitives';
import { StockDirection, StockReferenceType } from './enums';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  SortOrderSchema,
} from './pagination.schema';

/**
 * OhMyPos — StockMovement response contract (ERD §3, System Design §7, ADR-007).
 * No write endpoint exists — StockMovement is created exclusively via
 * transaction-participant services (StockMovementsService). TASK-070 added the
 * read half; there is still deliberately no create/update/delete contract.
 */
export const StockMovementResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  /** Joined from RawMaterial so the table needs no second request per row. */
  rawMaterialName: z.string(),
  /** satuan — kg, liter, pcs. Free text on RawMaterial (ERD §3), not an enum. */
  rawMaterialUnit: z.string(),
  branchId: UuidString.nullable(),
  /**
   * Null for a central event — a central purchase or an OPENING stock-take.
   * That is attribution being genuinely absent (ADR-004), not a failed join, so
   * the UI renders it as "Pusat" rather than as a blank cell.
   */
  branchName: z.string().nullable(),
  direction: StockDirection,
  quantity: QuantityString,
  referenceType: StockReferenceType,
  referenceId: z.string().nullable(),
  unitCostAtMovement: MoneyString,
  movementDate: DateTimeString,
  createdAt: DateTimeString,
});
export type StockMovementResponse = z.infer<typeof StockMovementResponseSchema>;

/**
 * `rawMaterialName` is the one key here that is not a StockMovement column — it
 * lives on the related RawMaterial and needs a nested `orderBy`, exactly like
 * `supplierName` on `PayableSortBySchema`.
 *
 * `movementDate` and `createdAt` are BOTH offered and are genuinely different
 * dates: `applyOpening` stamps `movementDate` with the period start, which can
 * be weeks before the row was written. `movementDate` is the business date
 * (ADR-018) and therefore the default.
 */
export const StockMovementSortBySchema = z.enum([
  'movementDate',
  'quantity',
  'unitCostAtMovement',
  'rawMaterialName',
  'createdAt',
]);
export type StockMovementSortBy = z.infer<typeof StockMovementSortBySchema>;

export const StockMovementQuerySchema = PaginationQuerySchema.extend({
  /** Matches the raw material's name or the branch's name. */
  search: z.string().trim().optional(),
  rawMaterialId: UuidString.optional(),
  /** ATTRIBUTION filter only — stock itself is one central pool (ADR-004). */
  branchId: UuidString.optional(),
  direction: StockDirection.optional(),
  referenceType: StockReferenceType.optional(),
  /** Both bounds filter `movementDate`, never `createdAt` — see the note above. */
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
  sortBy: StockMovementSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});
export type StockMovementQuery = z.infer<typeof StockMovementQuerySchema>;

export const StockMovementListResponseSchema = z.object({
  data: z.array(StockMovementResponseSchema),
  meta: PaginationMetaSchema,
});
export type StockMovementListResponse = z.infer<
  typeof StockMovementListResponseSchema
>;
