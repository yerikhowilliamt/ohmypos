import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TopProductsView } from './TopProductsView';
import type { TopProductsResponse } from '@ohmypos/api-contracts';
import { useTopProducts } from '@/hooks/useReports';

vi.mock('@/hooks/useReports', async () => {
  const actual = await vi.importActual('@/hooks/useReports');
  return { ...actual, useTopProducts: vi.fn() };
});

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
