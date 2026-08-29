import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ProfitLossView } from './ProfitLossView';
import type { ProfitLossResponse } from '@ohmypos/api-contracts';

const period = {
  startDate: '2026-08-01',
  endDate: '2026-08-18',
  timezone: 'Asia/Jakarta' as const,
  dayCount: 18,
  branchId: null,
  branchName: null,
};

const profitablePeriod: ProfitLossResponse = {
  period,
  salesRevenue: '412860000.00',
  otherIncome: '0.00',
  totalIncome: '412860000.00',
  cogs: '167900000.00',
  grossProfit: '244960000.00',
  operatingExpenses: '148420000.00',
  netProfit: '96540000.00',
  netMarginPct: 23.39,
  cash: {
    totalInflow: '412860000.00',
    totalOutflow: '316320000.00',
    materialCashOutflow: '180000000.00',
    netCashFlow: '96540000.00',
  },
  saleCount: 812,
};

const lossPeriod: ProfitLossResponse = {
  ...profitablePeriod,
  period: { ...period, branchId: 'b-1', branchName: 'Umum' },
  totalIncome: '0.00',
  salesRevenue: '0.00',
  grossProfit: '-50000000.00',
  netProfit: '-50000000.00',
  netMarginPct: null,
  cash: {
    totalInflow: '0.00',
    totalOutflow: '50000000.00',
    materialCashOutflow: '50000000.00',
    netCashFlow: '-50000000.00',
  },
};

describe('ProfitLossView component', () => {
  it('renders a loading skeleton without crashing', () => {
    render(
      <ProfitLossView
        data={undefined}
        isLoading
        filters={{ startDate: '2026-01-01', endDate: '2026-01-31' }}
      />,
    );
    expect(screen.queryByText('Pendapatan')).not.toBeInTheDocument();
  });

  it('renders the margin-view KPI cards and the cash block for a profitable period', () => {
    render(
      <ProfitLossView
        data={profitablePeriod}
        isLoading={false}
        filters={{ startDate: '2026-01-01', endDate: '2026-01-31' }}
      />,
    );

    expect(screen.getByText('Pendapatan')).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*412\.860\.000/)[0]).toBeInTheDocument();
    expect(screen.getByText(/margin 23,39%/)).toBeInTheDocument();
    expect(screen.getByText('Arus Kas Periode Ini')).toBeInTheDocument();
  });

  it('colors netProfit and netCashFlow as outflow when the period is a loss (ADR-017 §2)', () => {
    render(
      <ProfitLossView
        data={lossPeriod}
        isLoading={false}
        filters={{ startDate: '2026-01-01', endDate: '2026-01-31' }}
      />,
    );

    const netProfitValue = screen.getAllByText(/-Rp\s*50\.000\.000/)[0];
    expect(netProfitValue).toHaveClass('text-accent-outflow');
  });
});
