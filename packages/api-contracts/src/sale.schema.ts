import { z } from 'zod';
import {
  DateTimeString,
  IdempotencyKey,
  MoneyString,
  QuantityString,
  UuidString,
} from './primitives';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

export const SaleItemInputSchema = z.object({
  productId: UuidString,
  // Strictly positive.
  quantity: QuantityString.refine(
    (v) => Number(v) > 0,
    'Harus lebih besar dari 0',
  ),
  /** Per-line price override, the only discount mechanism in v1 (ADR-015). Omitted = `sellPrice`. */
  unitPrice: MoneyString.optional(),
});
export type SaleItemInput = z.infer<typeof SaleItemInputSchema>;

/** The same product may appear twice (e.g. at two prices); there is no duplicate check. */
export const CreateSaleSchema = z
  .object({
    /** Required: there is no central sale (ADR-004). */
    branchId: UuidString,
    /** The payment account. */
    accountId: UuidString,
    soldAt: DateTimeString.refine((v) => {
      const d = new Date(v).getTime();
      if (isNaN(d)) return false;
      const nowWithTolerance = Date.now() + 5 * 60 * 1000;
      const minDate = new Date('2024-01-01T00:00:00.000Z').getTime();
      return d <= nowWithTolerance && d >= minDate;
    }, 'soldAt cannot be in the future or before 2024'),
    /** At most 50 lines, to bound the lock-holding transaction (ADR-016). */
    items: z.array(SaleItemInputSchema).min(1).max(50),
    idempotencyKey: IdempotencyKey.optional(),
    // No userId, totalAmount or hppAtSale: the server derives all three.
  })
  .superRefine((dto, ctx) => {
    // Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991 (~9 * 10^15), safe in JS numbers
    const MAX_LINE_TOTAL = Number.MAX_SAFE_INTEGER;
    let saleTotal = 0;
    dto.items.forEach((item, index) => {
      if (item.unitPrice) {
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
        saleTotal += lineTotal;
        if (lineTotal > MAX_LINE_TOTAL) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'unitPrice'],
            message:
              'total baris melebihi nilai maksimum yang bisa disimpan (Decimal(18,2))',
          });
        }
      }
    });

    if (saleTotal > MAX_LINE_TOTAL) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message:
          'total penjualan melebihi nilai maksimum yang bisa disimpan (Decimal(18,2))',
      });
    }
  });
export type CreateSale = z.infer<typeof CreateSaleSchema>;

export const SaleItemResponseSchema = z.object({
  id: UuidString,
  productId: UuidString,
  productName: z.string(),
  quantity: QuantityString,
  unitPriceAtSale: MoneyString,
  isPriceOverridden: z.boolean(),
  /** PER-UNIT HPP snapshot (ADR-015) — not the line-extended cost. */
  hppAtSale: MoneyString,
  lineTotal: MoneyString,
});
export type SaleItemResponse = z.infer<typeof SaleItemResponseSchema>;

/** DEBT-010 — minimal interim void guard. No PARTIAL_REFUND value in v1. */
export const SaleStatusSchema = z.enum(['COMPLETED', 'VOIDED']);
export type SaleStatus = z.infer<typeof SaleStatusSchema>;

export const SaleResponseSchema = z.object({
  id: UuidString,
  branchId: UuidString,
  branchName: z.string(),
  accountId: UuidString,
  accountName: z.string(),
  userId: UuidString,
  cashierName: z.string(),
  ledgerEntryId: UuidString,
  /** = Σ SaleItem.lineTotal. No tax, no discount (ADR-015, DEBT-004). */
  totalAmount: MoneyString,
  /** = Σ (hppAtSale × quantity), rounded once — never the sum of stored per-line values. */
  totalHpp: MoneyString,
  /** = totalAmount − totalHpp. */
  grossMargin: MoneyString,
  soldAt: DateTimeString,
  items: z.array(SaleItemResponseSchema),
  /** DEBT-010 — COMPLETED unless voided within the same-day window. */
  status: SaleStatusSchema,
  voidedAt: DateTimeString.nullable(),
  voidedByUserId: UuidString.nullable(),
  createdAt: DateTimeString,
  updatedAt: DateTimeString,
});
export type SaleResponse = z.infer<typeof SaleResponseSchema>;

/**
 * The 409 body of `InsufficientStockException`. Shortfalls are per raw material,
 * not per cart line. Use `safeParse`: other 409s carry no `details`.
 */
export const StockShortfallSchema = z.object({
  rawMaterialId: UuidString,
  name: z.string(),
  required: QuantityString,
  available: QuantityString,
});
export type StockShortfall = z.infer<typeof StockShortfallSchema>;

export const InsufficientStockErrorSchema = z.object({
  statusCode: z.literal(409),
  code: z.literal('INSUFFICIENT_STOCK'),
  message: z.string(),
  details: z.object({ shortfalls: z.array(StockShortfallSchema) }),
});
export type InsufficientStockError = z.infer<
  typeof InsufficientStockErrorSchema
>;

export const SaleSortBySchema = z.enum(['soldAt', 'totalAmount', 'createdAt']);
export type SaleSortBy = z.infer<typeof SaleSortBySchema>;

export const SaleQuerySchema = PaginationQuerySchema.extend({
  /** Searches transaction id, branch, cashier and account names (DEBT-059). */
  search: z.string().trim().optional(),
  branchId: UuidString.optional(),
  accountId: UuidString.optional(),
  userId: UuidString.optional(),
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
  sortBy: SaleSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});
export type SaleQuery = z.infer<typeof SaleQuerySchema>;
