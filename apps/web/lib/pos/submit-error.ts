/** Maps a failed `POST /sales` to in-cart feedback in Indonesian, naming the affected lines. Pure. */
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
  /** `fetch` rejected: the sale may or may not exist, so the cashier is sent to verify first. */
  if (!(error instanceof ApiError)) {
    return {
      kind: 'UNCERTAIN',
      message:
        'Koneksi terputus sebelum server menjawab. Status transaksi ini belum pasti — periksa transaksi terakhir sebelum mengulang, agar penjualan tidak tercatat dua kali.',
      lineIds: [],
      shortfalls: [],
    };
  }

  // A 5xx is equally ambiguous: the sale may have committed.
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

      // Shortfalls are per material; the recipe fan-out maps them to cart lines.
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

    // Other 409s (inactive product, no recipe) mean the product cache is stale.
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
