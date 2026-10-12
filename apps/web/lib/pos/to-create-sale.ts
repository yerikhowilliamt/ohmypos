/** Builds the `POST /sales` body and validates it with `CreateSaleSchema`. */
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
  idempotencyKey?: string;
}

export function toCreateSale({
  branchId,
  accountId,
  lines,
  soldAt,
  idempotencyKey,
}: ToCreateSaleInput): ToCreateSaleResult {
  const candidate = {
    branchId,
    accountId,
    soldAt: soldAt.toISOString(),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    items: lines.map((line) => ({
      productId: line.productId,
      quantity: formatFixed(fromInt(line.quantity, 0), QUANTITY_SCALE),
      /** Omitted (not null) without an override, so the server charges `sellPrice`. */
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
