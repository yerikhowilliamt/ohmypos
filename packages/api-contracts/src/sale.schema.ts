import { z } from 'zod';
import {
  DateTimeString,
  IdempotencyKey,
  MoneyString,
  QuantityString,
  UuidString,
} from './primitives';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

/**
 * OhMyPos — Sale contracts (ERD §3, System Design §6.1, PRD §5.2, ADR-005, ADR-015).
 */
export const SaleItemInputSchema = z.object({
  productId: UuidString,
  // Strictly positive: a zero-quantity line writes a no-op StockMovement and a
  // zero lineTotal (mirrors SupplierPurchaseItemInputSchema).
  quantity: QuantityString.refine(
    (v) => Number(v) > 0,
    'must be greater than zero',
  ),
  /**
   * Per-line price override — PRD §5.2's mechanism for "discounts or negotiated
   * prices", and the ONLY discount mechanism in v1 (ADR-015, DEBT-004). Omitted
   * means charge Product.sellPrice as of this moment.
   */
  unitPrice: MoneyString.optional(),
});
export type SaleItemInput = z.infer<typeof SaleItemInputSchema>;

/**
 * Deliberately NO duplicate-productId check, unlike CreateSupplierPurchaseSchema's
 * duplicate-rawMaterialId refinement. The same product may legitimately appear
 * twice at two different prices — one at the menu price, one discounted — and
 * that is exactly what the per-line override is for. The stock fan-out
 * aggregation (sale-stock.calculator.ts) is what keeps the lock set unambiguous
 * here, so the constraint that Phase 4 needed is unnecessary in this direction.
 */
export const CreateSaleSchema = z
  .object({
    /**
     * REQUIRED, NOT nullable — unlike SupplierPurchase.branchId. There is no such
     * thing as a central sale: a sale happens at an outlet (ADR-004). The seeded
     * system location (`Branch.isSystem`) is rejected server-side (ADR-014).
     */
    branchId: UuidString,
    /** The payment method used — Account, per ERD §3 and System Design §6.1. */
    accountId: UuidString,
    soldAt: DateTimeString.refine((v) => {
      const d = new Date(v).getTime();
      if (isNaN(d)) return false;
      const nowWithTolerance = Date.now() + 5 * 60 * 1000;
      const minDate = new Date('2024-01-01T00:00:00.000Z').getTime();
      return d <= nowWithTolerance && d >= minDate;
    }, 'soldAt cannot be in the future or before 2024'),
    /**
     * Bounded at 50 lines. Every line adds round trips inside a transaction that
     * holds row locks (ADR-016), and the bound is what keeps the lock-hold window
     * and the transaction timeout predictable.
     */
    items: z.array(SaleItemInputSchema).min(1).max(50),
    idempotencyKey: IdempotencyKey.optional(),
    // NOTE: no `userId` — it comes from the JWT (RoleGuard/@ReqUser), never the
    // body: a client-supplied cashier id is a forgeable audit trail. No
    // `totalAmount`, no `hppAtSale` — the server computes both; a client-supplied
    // total is a money-correctness hole and a client-supplied HPP is a
    // margin-reporting hole.
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
 * The 409 body thrown by `InsufficientStockException` (Playbook §6).
 *
 * Shortfalls are per RAW MATERIAL, not per sale line — one short material can be
 * reached through several products (ADR-015 decision 3 aggregates the fan-out the
 * same way). A client maps them back to cart lines through the products'
 * `recipeItems`. Parse with `safeParse`: a 409 may also be `InactiveProduct` or
 * `RecipeIncomplete`, which carry no `details`.
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
  /**
   * Free-text search over transaction id, branch name, cashier name and account
   * name — exactly the columns the toolbar used to filter client-side, which
   * only ever saw the page on screen (DEBT-059).
   */
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
