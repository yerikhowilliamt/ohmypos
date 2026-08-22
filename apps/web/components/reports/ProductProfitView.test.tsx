import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ProductProfitView } from './ProductProfitView';
import type { ProductProfitResponse } from '@ohmypos/api-contracts';

const period = {
  startDate: '2026-08-01',
  endDate: '2026-08-18',
  timezone: 'Asia/Jakarta' as const,
  dayCount: 18,
  branchId: null,
  branchName: null,
};

const withRows: ProductProfitResponse = {
  period,
  rows: [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      productName: 'Es Kopi Susu',
      quantitySold: '48.0000',
      revenue: '1056000.00',
      cogs: '480000.00',
      grossProfit: '576000.00',
      marginPct: 54.55,
      lineCount: 48,
    },
    {
      productId: '22222222-2222-4222-8222-222222222222',
      productName: 'Roti Bakar Rugi',
      quantitySold: '4.0000',
      revenue: '0.00',
      cogs: '20000.00',
      grossProfit: '-20000.00',
      marginPct: null,
      lineCount: 4,
    },
  ],
  totals: {
    revenue: '1056000.00',
    cogs: '500000.00',
    grossProfit: '556000.00',
  },
};

const empty: ProductProfitResponse = {
  period,
  rows: [],
  totals: { revenue: '0.00', cogs: '0.00', grossProfit: '0.00' },
};

describe('ProductProfitView component', () => {
  it('renders product rows with revenue, margin, and signed gross profit coloring', () => {
    render(
      <ProductProfitView
        data={withRows}
        isLoading={false}
        filters={{ startDate: '2026-01-01', endDate: '2026-01-31' }}
      />,
    );

    expect(screen.getByText('Es Kopi Susu')).toBeInTheDocument();
    expect(screen.getByText('54,55%')).toBeInTheDocument();
    expect(screen.getByText('Roti Bakar Rugi')).toBeInTheDocument();
    // A fully-discounted/loss line shows the fallback dash for margin, never NaN.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows the empty state and no chart when the range has no product sales', () => {
    render(
      <ProductProfitView
        data={empty}
        isLoading={false}
        filters={{ startDate: '2026-01-01', endDate: '2026-01-31' }}
      />,
    );

    expect(
      screen.getByText('Tidak ada penjualan produk pada rentang ini.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tidak ada data laba produk')).toBeInTheDocument();
  });
});
