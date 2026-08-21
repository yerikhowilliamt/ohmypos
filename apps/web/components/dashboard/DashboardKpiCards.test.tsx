import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { DashboardKpiCards } from './DashboardKpiCards';

const profitLoss = {
  netProfit: '500000.00',
  netMarginPct: 12.5,
} as never;

const cashBalance = { totalBalance: '2000000.00' } as never;

describe('DashboardKpiCards', () => {
  it('renders all 4 KPI cards with formatted values', () => {
    renderWithClient(
      <DashboardKpiCards
        cashBalance={cashBalance}
        profitLoss={profitLoss}
        payablesSummary={[
          {
            supplierId: 'a',
            supplierName: 'A',
            openPayableCount: 1,
            totalOutstanding: '100000.00',
          },
        ]}
        inventorySummary={
          { data: [{ status: 'LOW' }, { status: 'OK' }] } as never
        }
      />,
    );
    expect(screen.getByText('Kas')).toBeInTheDocument();
    expect(screen.getByText('Laba Bersih Bulan Ini')).toBeInTheDocument();
    expect(screen.getByText('Utang Supplier')).toBeInTheDocument();
    expect(screen.getByText('Stok Rendah')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // low stock count
  });

  it('shows loading placeholders when isLoading is true', () => {
    renderWithClient(
      <DashboardKpiCards
        cashBalance={undefined}
        profitLoss={undefined}
        payablesSummary={undefined}
        inventorySummary={undefined}
        isLoading
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('colors net profit as danger when negative', () => {
    const { container } = renderWithClient(
      <DashboardKpiCards
        cashBalance={cashBalance}
        profitLoss={{ netProfit: '-100000.00', netMarginPct: -5 } as never}
        payablesSummary={[]}
        inventorySummary={{ data: [] } as never}
      />,
    );
    expect(container.querySelector('.text-status-danger')).not.toBeNull();
  });

  it('colors utang as warning when > 0', () => {
    const { container } = renderWithClient(
      <DashboardKpiCards
        cashBalance={cashBalance}
        profitLoss={profitLoss}
        payablesSummary={[
          {
            supplierId: 'a',
            supplierName: 'A',
            openPayableCount: 1,
            totalOutstanding: '50000.00',
          },
        ]}
        inventorySummary={{ data: [] } as never}
      />,
    );
    expect(container.querySelector('.text-status-warning')).not.toBeNull();
  });
});
