import { describe, expect, it, vi } from 'vitest';
import type { PaginationMeta } from '@ohmypos/api-contracts';
import {
  EXPORT_ROW_CAP,
  ExportTooLargeError,
  fetchAllPages,
} from './fetchAllPages';

interface Row {
  id: string;
}

function meta(over: Partial<PaginationMeta> = {}): PaginationMeta {
  return { total: 1, page: 1, limit: 100, totalPages: 1, ...over };
}

function rows(prefix: string, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }));
}

describe('fetchAllPages', () => {
  it('makes a single request when the result fits on one page', async () => {
    const fetchPage = vi.fn(async () => ({
      data: rows('a', 3),
      meta: meta({ total: 3, totalPages: 1 }),
    }));

    const result = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });

  it('always asks for limit=100 — the cap PaginationQuerySchema allows', async () => {
    // Attendance raises its own cap to 500 (device.schema.ts), but one value
    // for every endpoint means this loop is exercised in one place rather than
    // branching per module.
    const fetchPage = vi.fn(async () => ({
      data: rows('a', 1),
      meta: meta({ total: 1, totalPages: 1 }),
    }));

    await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledWith(1, 100);
  });

  it('walks every page and concatenates them in order', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      data: rows(`p${page}`, 2),
      meta: meta({ total: 6, totalPages: 3 }),
    }));

    const result = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
    expect(result.map((row) => row.id)).toEqual([
      'p1-0',
      'p1-1',
      'p2-0',
      'p2-1',
      'p3-0',
      'p3-1',
    ]);
  });

  it('throws instead of truncating when the set exceeds the cap', async () => {
    // Truncating here would be the very defect this module closes, only with a
    // bigger number: a partial spreadsheet that says nothing about being partial.
    const fetchPage = vi.fn(async () => ({
      data: rows('a', 100),
      meta: meta({ total: EXPORT_ROW_CAP + 1, totalPages: 100 }),
    }));

    await expect(fetchAllPages(fetchPage)).rejects.toBeInstanceOf(
      ExportTooLargeError,
    );
    // And it gives up immediately — no second request is spent discovering
    // something page 1 already reported.
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('accepts a set sitting exactly on the cap', async () => {
    const fetchPage = vi.fn(async () => ({
      data: rows('a', 1),
      meta: meta({ total: EXPORT_ROW_CAP, totalPages: 1 }),
    }));

    await expect(fetchAllPages(fetchPage)).resolves.toHaveLength(1);
  });

  it('stops early on an empty page instead of spinning to totalPages', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      data: page >= 3 ? [] : rows(`p${page}`, 2),
      meta: meta({ total: 10, totalPages: 5 }),
    }));

    const result = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(4);
  });

  it('reads totalPages from page 1 and does not chase a growing set', async () => {
    // A sale landing mid-loop must not extend the walk: the export is a
    // snapshot of the set as page 1 described it, not a moving target.
    const fetchPage = vi.fn(async (page: number) => ({
      data: rows(`p${page}`, 1),
      meta: meta({ total: 2, totalPages: page === 1 ? 2 : 99 }),
    }));

    const result = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});
