import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DailyIncomeView } from './DailyIncomeView';
import type { DailyIncomeResponse } from '@ohmypos/api-contracts';

const period = {
  startDate: '2026-08-01',
  endDate: '2026-08-03',
  timezone: 'Asia/Jakarta' as const,
  dayCount: 3,
  branchId: null,
  branchName: null,
};

const withRows: DailyIncomeResponse = {
  period,
  rows: [
    { date: '2026-08-01', income: '1500000.00', entryCount: 12 },
    { date: '2026-08-02', income: '0.00', entryCount: 0 },
    { date: '2026-08-03', income: '2200000.00', entryCount: 18 },
  ],
  total: '3700000.00',
  averagePerDay: '1233333.33',
};

const empty: DailyIncomeResponse = {
  period,
  rows: [],
  total: '0.00',
  averagePerDay: '0.00',
};

describe('DailyIncomeView component', () => {
  it('renders zero-filled daily rows and the trend chart (gap-fill, ADR-018)', () => {
    render(<DailyIncomeView data={withRows} isLoading={false} />);

    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText('2026-08-02')).toBeInTheDocument();
    expect(screen.getByText('Total Pendapatan Periode')).toBeInTheDocument();
  });

  it('shows the chart empty state when there is no income in range', () => {
    render(<DailyIncomeView data={empty} isLoading={false} />);
    expect(
      screen.getByText('Tidak ada pendapatan pada rentang ini.'),
    ).toBeInTheDocument();
  });
});
