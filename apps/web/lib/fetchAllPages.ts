/**
 * Fetches every page for Export (DEBT-048). The API caps `limit` at 100;
 * exceeding `EXPORT_ROW_CAP` is an error, never a silent partial export.
 */
import type { PaginationMeta } from '@ohmypos/api-contracts';

/** 50 requests × 100 rows: half the per-minute throttle budget. */
export const EXPORT_ROW_CAP = 5000;

/** Always 100, even where an endpoint allows more, so one code path is tested. */
const PAGE_LIMIT = 100;

export class ExportTooLargeError extends Error {
  constructor(readonly total: number) {
    super(`Export melebihi ${EXPORT_ROW_CAP} baris (${total}).`);
    this.name = 'ExportTooLargeError';
  }
}

/** Loops `fetchPage`; `totalPages` comes from page 1 and an empty page stops early. */
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
