/**
 * OhMyPos — cart → `POST /sales` request (ADR-010, Phase 8c plan §4).
 *
 * The mapping is never hand-typed: the object is built and then validated with
 * `CreateSaleSchema` itself, so a drift between this screen and the API surfaces
 * here rather than as a 400 the cashier cannot act on.
 */
import { CreateSaleSchema, type CreateSale } from '@ohmypos/api-contracts';
import { QUANTITY_SCALE, formatFixed, fromInt } from '@/lib/decimal';
import type { CartLine } from './cart.reducer';

export type ToCreateSaleResult =
  { ok: true; value: CreateSale } | { ok: false; error: string };

export interface ToCreateSaleInput {
  branchId: string;
  accountId: string;
  lines: CartLine[];
  /** Injected rather than read from the clock, so the mapping stays pure. */
  soldAt: Date;
}

export function toCreateSale({
  branchId,
  accountId,
  lines,
  soldAt,
}: ToCreateSaleInput): ToCreateSaleResult {
  const candidate = {
    branchId,
    accountId,
    soldAt: soldAt.toISOString(),
    items: lines.map((line) => ({
      productId: line.productId,
      quantity: formatFixed(fromInt(line.quantity, 0), QUANTITY_SCALE),
      /**
       * `unitPrice` is OMITTED, not null, when there is no override — the schema
       * marks it `.optional()`, and omitting it is what tells the server to charge
       * `Product.sellPrice` as of that moment and leave `isPriceOverridden` false.
       * The server decides that flag; the client never sends it.
       */
      ...(line.overridePrice !== null && { unitPrice: line.overridePrice }),
    })),
  };

  const parsed = CreateSaleSchema.safeParse(candidate);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first
        ? `${first.path.join('.')}: ${first.message}`
        : 'Data penjualan tidak valid.',
    };
  }

  return { ok: true, value: parsed.data };
}
