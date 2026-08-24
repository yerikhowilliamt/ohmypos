import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';

const useStockMovements = vi.fn();

vi.mock('@/hooks/useInventory', () => ({
  useStockMovements: (params: unknown) => useStockMovements(params),
  fetchStockMovementsPage: vi.fn(async () => ({
    data: [],
    meta: { total: 0, page: 1, limit: 100, totalPages: 1 },
  })),
}));
vi.mock('@/hooks/useMasterData', () => ({
  useRawMaterials: () => ({ data: [] }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ data: [] }),
}));
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx: vi.fn(),
}));

import { StockMovementsClient } from './StockMovementsClient';

/** The params object of the most recent `useStockMovements` call. */
function lastParams(): Record<string, unknown> {
  const calls = useStockMovements.mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as Record<string, unknown>;
}

/**
 * The highest-volume table in the system had a search box that could only see
 * one page of it (DEBT-047). These cases pin the server-side replacement.
 */
describe('StockMovementsClient server-side search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStockMovements.mockReturnValue({
      data: {
        data: [],
        meta: { total: 594, page: 1, limit: 25, totalPages: 24 },
      },
      isLoading: false,
    });
  });

  it('sends no search parameter before anything is typed', () => {
    render(<StockMovementsClient />);
    expect(lastParams().search).toBeUndefined();
  });

  it('sends the keyword to the hook once typing settles', async () => {
    render(<StockMovementsClient />);

    fireEvent.change(screen.getByLabelText('Cari pergerakan stok'), {
      target: { value: 'kopi' },
    });

    await waitFor(() => {
      expect(lastParams().search).toBe('kopi');
    });
  });

  it('returns to page 1 when the keyword changes', async () => {
    render(<StockMovementsClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => {
      expect(lastParams().page).toBe(2);
    });

    fireEvent.change(screen.getByLabelText('Cari pergerakan stok'), {
      target: { value: 'kopi' },
    });

    // Both in one waitFor: asserting the page separately could read an
    // intermediate render and pass (or fail) on timing rather than on behaviour.
    await waitFor(() => {
      expect(lastParams()).toMatchObject({ search: 'kopi', page: 1 });
    });
  });

  it('drops the parameter when the box is cleared', async () => {
    render(<StockMovementsClient />);
    const box = screen.getByLabelText('Cari pergerakan stok');

    fireEvent.change(box, { target: { value: 'kopi' } });
    await waitFor(() => {
      expect(lastParams().search).toBe('kopi');
    });

    fireEvent.change(box, { target: { value: '' } });
    await waitFor(() => {
      expect(lastParams().search).toBeUndefined();
    });
  });

  it('clears the keyword with Reset Filter', async () => {
    render(<StockMovementsClient />);

    fireEvent.change(screen.getByLabelText('Cari pergerakan stok'), {
      target: { value: 'kopi' },
    });
    await waitFor(() => {
      expect(lastParams().search).toBe('kopi');
    });

    fireEvent.click(screen.getByRole('button', { name: /reset filter/i }));

    await waitFor(() => {
      expect(lastParams().search).toBeUndefined();
    });
  });
});
