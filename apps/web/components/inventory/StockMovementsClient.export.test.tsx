import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';

const useStockMovements = vi.fn();
const fetchStockMovementsPage = vi.fn();
const exportRowsToXlsx = vi.fn();

vi.mock('@/hooks/useInventory', () => ({
  useStockMovements: (params: unknown) => useStockMovements(params),
  fetchStockMovementsPage: (params: unknown) => fetchStockMovementsPage(params),
}));
vi.mock('@/hooks/useMasterData', () => ({
  useRawMaterials: () => ({ data: [] }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ data: [] }),
}));
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx: (...args: unknown[]) => exportRowsToXlsx(...args),
}));

import { StockMovementsClient } from './StockMovementsClient';

/** Params of the most recent on-screen query. */
function screenParams(): Record<string, unknown> {
  const calls = useStockMovements.mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as Record<string, unknown>;
}

/**
 * Export used to build its workbook from the 25 rows the table happened to
 * hold, while looking like it exported the whole filtered history (DEBT-048).
 */
describe('StockMovementsClient export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStockMovements.mockReturnValue({
      data: {
        data: [],
        meta: { total: 240, page: 1, limit: 25, totalPages: 10 },
      },
      isLoading: false,
    });
    fetchStockMovementsPage.mockImplementation(
      async (params: { page: number }) => ({
        data: params.page <= 3 ? [{ id: `row-${params.page}` }] : [],
        meta: { total: 240, page: params.page, limit: 100, totalPages: 3 },
      }),
    );
  });

  it('labels the button with the server total, not the page it holds', () => {
    render(<StockMovementsClient />);
    expect(
      screen.getByRole('button', { name: /export \(240\)/i }),
    ).toBeInTheDocument();
  });

  it('walks every page instead of exporting the one on screen', async () => {
    render(<StockMovementsClient />);

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());
    expect(fetchStockMovementsPage).toHaveBeenCalledTimes(3);
    // Three rows in the file where the table held zero.
    expect(exportRowsToXlsx.mock.calls[0]![2]).toHaveLength(3);
  });

  it('exports with EXACTLY the filters on screen, overriding only page/limit', async () => {
    // Trap 1: rebuilding the filters for the export separately is how the file
    // quietly ends up holding a different set from the screen — with nothing
    // in the file to say so.
    render(<StockMovementsClient />);

    fireEvent.change(screen.getByLabelText('Cari pergerakan stok'), {
      target: { value: 'kopi' },
    });
    await waitFor(() => expect(screenParams().search).toBe('kopi'));

    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());

    const onScreen = screenParams();
    const exported = fetchStockMovementsPage.mock.calls[0]![0] as Record<
      string,
      unknown
    >;

    const stripPaging = (params: Record<string, unknown>) => {
      const rest = { ...params };
      delete rest.page;
      delete rest.limit;
      return rest;
    };

    // Every filter identical; only the paging differs.
    expect(stripPaging(exported)).toEqual(stripPaging(onScreen));
    expect(exported.page).toBe(1);
    expect(exported.limit).toBe(100);
  });

  it('falls back to today when no date range is picked', async () => {
    render(<StockMovementsClient />);

    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());

    // With no range selected there is nothing better to name the file after.
    // The range-named case lives in ProfitLossView.test.tsx, where the range is
    // a prop rather than a Radix date picker.
    expect(exportRowsToXlsx.mock.calls[0]![0]).toMatch(
      /^pergerakan-stok_\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });
});
