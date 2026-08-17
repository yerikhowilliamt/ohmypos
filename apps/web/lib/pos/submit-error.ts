/**
 * OhMyPos — mapping a failed `POST /sales` onto in-cart feedback
 * (Playbook §6, Phase 8c plan §5).
 *
 * The screen never shows a generic toast. Every failure resolves to a `CartError`
 * that names what went wrong in Indonesian and, where possible, which cart lines
 * are implicated.
 *
 * Pure: takes an already-thrown error plus the cart context, returns state.
 */
import {
  InsufficientStockErrorSchema,
  type ProductWithHppResponse,
} from '@ohmypos/api-contracts';
import { ApiError } from '@/lib/api';
import type { CartError, CartLine } from './cart.reducer';
import { formatQuantity } from '@/lib/formatters';

export interface MapSubmitErrorInput {
  error: unknown;
  lines: CartLine[];
  products: ProductWithHppResponse[];
}

export function mapSubmitError({
  error,
  lines,
  products,
}: MapSubmitErrorInput): CartError {
  /**
   * Not an `ApiError` at all — `fetch` itself rejected, so the request may or may
   * not have reached the server. There is no idempotency key on `POST /sales`
   * (see DEBT entry), so a blind retry could double-write a `LedgerEntry` —
   * exactly the risk ADR-016 names when it rejects optimistic retry. The cashier
   * is sent to verify instead of being offered a retry button.
   */
  if (!(error instanceof ApiError)) {
    return {
      kind: 'UNCERTAIN',
      message:
        'Koneksi terputus sebelum server menjawab. Status transaksi ini belum pasti — periksa transaksi terakhir sebelum mengulang, agar penjualan tidak tercatat dua kali.',
      lineIds: [],
      shortfalls: [],
    };
  }

  // A 5xx is equally ambiguous: the transaction may have committed before the
  // response was lost.
  if (error.status >= 500) {
    return {
      kind: 'UNCERTAIN',
      message:
        'Server gagal menjawab. Status transaksi ini belum pasti — periksa transaksi terakhir sebelum mengulang.',
      lineIds: [],
      shortfalls: [],
    };
  }

  if (error.status === 403) {
    return {
      kind: 'FORBIDDEN',
      message:
        'Anda tidak berwenang mencatat penjualan di cabang ini. Keluar dan masuk kembali, lalu coba lagi.',
      lineIds: [],
      shortfalls: [],
    };
  }

  if (error.status === 409) {
    const stock = InsufficientStockErrorSchema.safeParse(error.body);

    if (stock.success) {
      const shortMaterialIds = new Set(
        stock.data.details.shortfalls.map((s) => s.rawMaterialId),
      );
      const productById = new Map(products.map((p) => [p.id, p]));

      // Shortfalls are per raw material; cart lines are per product. The recipe
      // fan-out is what bridges them (plan §1b).
      const lineIds = lines
        .filter((line) =>
          productById
            .get(line.productId)
            ?.recipeItems.some((item) =>
              shortMaterialIds.has(item.rawMaterialId),
            ),
        )
        .map((line) => line.id);

      const detail = stock.data.details.shortfalls
        .map(
          (s) =>
            `${s.name} (butuh ${formatQuantity(s.required)}, tersedia ${formatQuantity(s.available)})`,
        )
        .join('; ');

      return {
        kind: 'INSUFFICIENT_STOCK',
        message: `Stok bahan baku tidak mencukupi: ${detail}. Kurangi jumlah pada baris yang ditandai, lalu coba lagi.`,
        lineIds,
        shortfalls: stock.data.details.shortfalls,
      };
    }

    // The other 409s — `InactiveProductException`, `RecipeIncompleteException`.
    // The product grid already blocks both, so reaching here means the cached
    // product list is stale; the caller invalidates it.
    return {
      kind: 'STALE_PRODUCT',
      message: `${error.message} Daftar produk telah disegarkan — periksa kembali keranjang.`,
      lineIds: [],
      shortfalls: [],
    };
  }

  if (error.status === 404) {
    return {
      kind: 'STALE_PRODUCT',
      message: `${error.message} Produk mungkin sudah dihapus — hapus baris tersebut dari keranjang.`,
      lineIds: [],
      shortfalls: [],
    };
  }

  if (error.status === 400) {
    return {
      kind: 'INVALID',
      message: error.message,
      lineIds: [],
      shortfalls: [],
    };
  }

  return {
    kind: 'UNKNOWN',
    message: error.message,
    lineIds: [],
    shortfalls: [],
  };
}
