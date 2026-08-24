import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TopProductsView } from './TopProductsView';
import type { TopProductsResponse } from '@ohmypos/api-contracts';
import { useTopProducts } from '@/hooks/useReports';

vi.mock('@/hooks/useReports', async () => {
  const actual = await vi.importActual('@/hooks/useReports');
  return { ...actual, useTopProducts: vi.fn() };
});

const exportRowsToXlsx = vi.hoisted(() =>
  vi.fn<(filename: string, columns: unknown, rows: unknown[]) => Promise<void>>(
    async () => undefined,
  ),
);
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx,
}));

const period = {
  startDate: '2026-08-01',
  endDate: '2026-08-18',
  timezone: 'Asia/Jakarta' as const,
  dayCount: 18,
  branchId: null,
  branchName: null,
};

const withRows: TopProductsResponse = {
  period,
  rankBy: 'quantity',
  rows: [
    {
      rank: 1,
      productId: '11111111-1111-4111-8111-111111111111',
      productName: 'Es Kopi Susu',
      quantitySold: '48.0000',
      revenue: '1056000.00',
      cogs: '480000.00',
      grossProfit: '576000.00',
      marginPct: 54.55,
      lineCount: 48,
    },
  ],
};

const filters = { startDate: '2026-08-01', endDate: '2026-08-18' };

describe('TopProductsView component', () => {
  it('renders the rank-by control and the ranked product rows', () => {
    vi.mocked(useTopProducts).mockReturnValue({
      data: withRows,
      isLoading: false,
    } as unknown as ReturnType<typeof useTopProducts>);

    render(<TopProductsView filters={filters} enabled />);

    expect(screen.getByText('Urutkan berdasarkan')).toBeInTheDocument();
    expect(screen.getByText('Es Kopi Susu')).toBeInTheDocument();
  });

  it('shows the empty state when nothing sold in range', () => {
    vi.mocked(useTopProducts).mockReturnValue({
      data: { period, rankBy: 'quantity', rows: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useTopProducts>);

    render(<TopProductsView filters={filters} enabled />);

    expect(
      screen.getByText('Tidak ada produk terjual pada rentang ini.'),
    ).toBeInTheDocument();
  });
});

/**
 * Trap 3 (TASK-073). `useTopProducts` is called with `limit: 10` — that is the
 * DEFINITION of this report, not a pagination truncation. Handing this view an
 * `exportAll` prop would change what the file means, from "the ten best sellers"
 * to "the whole catalogue", while every other signal on screen still said top 10.
 */
describe('TopProductsView export stays the ranked set', () => {
  it('exports exactly the ranked rows it renders, with no page walk', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      ...withRows.rows[0]!,
      rank: i + 1,
      productId: `1111111${i}-1111-4111-8111-111111111111`,
      productName: `Produk ${i + 1}`,
    }));

    vi.mocked(useTopProducts).mockReturnValue({
      data: { ...withRows, rows },
      isLoading: false,
    } as unknown as ReturnType<typeof useTopProducts>);

    exportRowsToXlsx.mockClear();
    render(<TopProductsView filters={filters} enabled />);

    // The button states 10, the report's own limit — not a server total.
    fireEvent.click(screen.getByRole('button', { name: /export \(10\)/i }));

    await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());
    expect(exportRowsToXlsx.mock.calls[0]![2]).toHaveLength(10);
  });
});
