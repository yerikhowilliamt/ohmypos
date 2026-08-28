import { z } from 'zod';
import {
  DateTimeString,
  IdempotencyKey,
  MoneyString,
  QuantityString,
  UnitCostString,
  UuidString,
} from './primitives';
import { PaymentStatus, PurchasePaymentStatusInput } from './enums';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

/**
 * OhMyPos — SupplierPurchase contracts (ERD §3, System Design §6.2, ADR-004, ADR-006).
 */
export const SupplierPurchaseItemInputSchema = z.object({
  rawMaterialId: UuidString,
  /**
   * Quantity in the material's PURCHASE unit — "2" for 2 liter (ADR-024).
   *
   * Strictly positive: a zero-quantity purchase line is meaningless, would
   * write a no-op StockMovement (mirrors RecipeItemInputSchema's rule), and
   * would make the normalized unit cost a division by zero.
   */
  purchaseQuantity: QuantityString.refine(
    (v) => Number(v) > 0,
    'must be greater than zero',
  ),
  /**
   * The TOTAL price paid for the whole `purchaseQuantity` — Rp45.000 for
   * 2 liter, NOT Rp45.000 per liter (ADR-024). This is the number written on
   * the supplier's nota, which is the point: the user should never have to
   * divide anything by hand.
   *
   * `quantity` and `unitCost` are deliberately NOT accepted here. The server
   * derives both from this total and the material's stored conversion factor,
   * for the same reason `totalAmount` is absent below — a client-supplied cost
   * is a money-correctness hole.
   */
  lineTotal: MoneyString.refine(
    (v) => Number(v) > 0,
    'must be greater than zero',
  ),
});
export type SupplierPurchaseItemInput = z.infer<
  typeof SupplierPurchaseItemInputSchema
>;

export const CreateSupplierPurchaseSchema = z
  .object({
    supplierId: UuidString,
    /**
     * REQUIRED KEY, explicitly nullable. `null` means central purchase (ADR-004,
     * ERD §3) and is the only way to record one. Not `.optional()`: "central"
     * must be typed deliberately, never arrived at by forgetting the field.
     * BranchScopeGuard rejects null for KASIR before this schema ever runs (§6.6).
     */
    branchId: UuidString.nullable(),
    purchaseDate: DateTimeString,
    paymentStatus: PurchasePaymentStatusInput,
    /** The account the money left, when paymentStatus = PAID. Forbidden otherwise. */
    accountId: UuidString.optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: IdempotencyKey.optional(),
    items: z.array(SupplierPurchaseItemInputSchema).min(1),
    // NOTE: there is deliberately no `totalAmount` field. The server computes it
    // from the items (§9.3) — a client-supplied total is a money-correctness hole.
  })
  .superRefine((dto, ctx) => {
    // ADR-006, encoded at the edge: PAID needs an account to debit; UNPAID must
    // not name one, because no money moves until settlement.
    if (dto.paymentStatus === 'PAID' && !dto.accountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountId'],
        message: 'accountId is required when paymentStatus is PAID',
      });
    }
    if (dto.paymentStatus === 'UNPAID' && dto.accountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountId'],
        message:
          'accountId must be omitted when paymentStatus is UNPAID — no money moves until settlement (ADR-006)',
      });
    }
    // One line per raw material, so the FOR UPDATE lock set and the stock
    // increment are unambiguous (mirrors ReplaceRecipeSchema's superRefine).
    // Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991 (~9 * 10^15), safe in JS numbers
    const MAX_LINE_TOTAL = Number.MAX_SAFE_INTEGER;
    let purchaseTotal = 0;
    const seen = new Set<string>();
    dto.items.forEach((item, index) => {
      // No multiplication any more (ADR-024): the line total IS the input, so
      // the only overflow left to guard is the sum across lines.
      const lineTotal = Number(item.lineTotal);
      purchaseTotal += lineTotal;
      if (lineTotal > MAX_LINE_TOTAL) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'lineTotal'],
          message:
            'total baris melebihi nilai maksimum yang bisa disimpan (Decimal(18,2))',
        });
      }
      if (seen.has(item.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'rawMaterialId'],
          message: 'duplicate rawMaterialId in the same purchase',
        });
      }
      seen.add(item.rawMaterialId);
    });

    if (purchaseTotal > MAX_LINE_TOTAL) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message:
          'total pembelian melebihi nilai maksimum yang bisa disimpan (Decimal(18,2))',
      });
    }
  });
export type CreateSupplierPurchase = z.infer<
  typeof CreateSupplierPurchaseSchema
>;

export const SupplierPurchaseItemResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  rawMaterialName: z.string(),
  /** The material's STOCK unit, which `quantity` and `unitCost` are in. */
  unit: z.string(),
  /** WHAT WAS BOUGHT — snapshot, frozen at recording time (ADR-024). */
  purchaseQuantity: QuantityString,
  purchaseUnit: z.string(),
  conversionFactor: QuantityString,
  /** WHAT STOCK RECEIVED — purchaseQuantity × conversionFactor, in `unit`. */
  quantity: QuantityString,
  /** Normalized cost per stock unit — lineTotal ÷ quantity (ADR-024). */
  unitCost: UnitCostString,
  /** The total price the user entered for this line. */
  lineTotal: MoneyString,
});
export type SupplierPurchaseItemResponse = z.infer<
  typeof SupplierPurchaseItemResponseSchema
>;

export const SupplierPurchaseResponseSchema = z.object({
  id: UuidString,
  supplierId: UuidString,
  supplierName: z.string(),
  branchId: UuidString.nullable(),
  isCentral: z.boolean(),
  purchaseDate: DateTimeString,
  paymentStatus: PaymentStatus,
  totalAmount: MoneyString,
  ledgerEntryId: UuidString.nullable(),
  payableId: UuidString.nullable(),
  note: z.string().nullable(),
  items: z.array(SupplierPurchaseItemResponseSchema),
  createdAt: DateTimeString,
  updatedAt: DateTimeString,
});
export type SupplierPurchaseResponse = z.infer<
  typeof SupplierPurchaseResponseSchema
>;

export const SupplierPurchaseSortBySchema = z.enum([
  'purchaseDate',
  'totalAmount',
  'createdAt',
]);
export type SupplierPurchaseSortBy = z.infer<
  typeof SupplierPurchaseSortBySchema
>;

export const SupplierPurchaseQuerySchema = PaginationQuerySchema.extend({
  supplierId: UuidString.optional(),
  branchId: UuidString.optional(),
  paymentStatus: PaymentStatus.optional(),
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
  sortBy: SupplierPurchaseSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});
export type SupplierPurchaseQuery = z.infer<typeof SupplierPurchaseQuerySchema>;
