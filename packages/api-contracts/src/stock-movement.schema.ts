import { z } from 'zod';
import {
  DateTimeString,
  QuantityString,
  UnitCostString,
  UuidString,
} from './primitives';
import { StockDirection, StockReferenceType } from './enums';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  SortOrderSchema,
} from './pagination.schema';

/** Stock movement (read only; movements are written only by services). */
export const StockMovementResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  /** Joined from RawMaterial so the table needs no second request per row. */
  rawMaterialName: z.string(),
  /** satuan — kg, liter, pcs. Free text on RawMaterial (ERD §3), not an enum. */
  rawMaterialUnit: z.string(),
  branchId: UuidString.nullable(),
  /** Null for a central event (central purchase, OPENING); shown as "Pusat". */
  branchName: z.string().nullable(),
  direction: StockDirection,
  quantity: QuantityString,
  referenceType: StockReferenceType,
  referenceId: z.string().nullable(),
  /** Per-unit rate at the moment of the movement — `Decimal(18,6)` (ADR-024). */
  unitCostAtMovement: UnitCostString,
  movementDate: DateTimeString,
  createdAt: DateTimeString,
});
export type StockMovementResponse = z.infer<typeof StockMovementResponseSchema>;

/** Sort keys. `movementDate` (the business date) is the default, not `createdAt`. */
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
  /** Both bounds filter `movementDate`, never `createdAt`. */
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
