/**
 * OhMyPos — pengambil seluruh halaman untuk tombol Export (DEBT-048).
 *
 * `PaginationQuerySchema` membatasi `limit` pada 100
 * (`packages/api-contracts/src/pagination.schema.ts`), jadi himpunan penuh hanya
 * bisa diperoleh dengan memutar halaman — tidak ada `limit=999999`.
 *
 * Throttler memberi 100 request per 60 detik per IP (`apps/api/src/app.module.ts`).
 * `EXPORT_ROW_CAP` menjaga satu ekspor tidak menghabiskan seluruh jatah itu.
 *
 * Melewati pagu adalah GALAT, bukan pemotongan diam: mengekspor sebagian tanpa
 * mengatakannya adalah persis cacat yang berkas ini ada untuk menutupnya.
 */
import type { PaginationMeta } from '@ohmypos/api-contracts';

/** 50 request @100 baris — setengah jatah throttle semenit. */
export const EXPORT_ROW_CAP = 5000;

/**
 * Selalu 100, termasuk untuk absensi yang menaikkan pagunya sendiri ke 500
 * (`device.schema.ts`). Satu nilai untuk semua endpoint berarti jalur ini
 * diuji di satu tempat, bukan bercabang per modul.
 */
const PAGE_LIMIT = 100;

export class ExportTooLargeError extends Error {
  constructor(readonly total: number) {
    super(`Export melebihi ${EXPORT_ROW_CAP} baris (${total}).`);
    this.name = 'ExportTooLargeError';
  }
}

/**
 * Memutar `fetchPage` sampai seluruh halaman terkumpul.
 *
 * `totalPages` dibaca dari halaman pertama dan tidak diperbarui: himpunan yang
 * bergerak di tengah putaran (penjualan baru masuk antara halaman 1 dan 30)
 * tidak dikejar. Halaman kosong menghentikan putaran lebih awal.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<{ data: T[]; meta: PaginationMeta }>,
): Promise<T[]> {
  const first = await fetchPage(1, PAGE_LIMIT);
  if (first.meta.total > EXPORT_ROW_CAP) {
    throw new ExportTooLargeError(first.meta.total);
  }

  const rows = [...first.data];
  const totalPages = first.meta.totalPages;

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await fetchPage(page, PAGE_LIMIT);
    if (next.data.length === 0) break;
    rows.push(...next.data);
  }

  return rows;
}
