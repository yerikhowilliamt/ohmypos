import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { IncomeByPaymentMethodView } from './IncomeByPaymentMethodView';
import type { IncomeByPaymentMethodResponse } from '@ohmypos/api-contracts';

const period = {
  startDate: '2026-08-01',
  endDate: '2026-08-18',
  timezone: 'Asia/Jakarta' as const,
  dayCount: 18,
  branchId: null,
  branchName: null,
};

const withRows: IncomeByPaymentMethodResponse = {
  period,
  rows: [
    {
      accountId: '11111111-1111-4111-8111-111111111111',
      accountName: 'Kas Toko',
      accountType: 'CASH',
      total: '2000000.00',
      salesTotal: '2000000.00',
      otherTotal: '0.00',
      sharePct: 66.67,
      entryCount: 20,
    },
    {
      accountId: '22222222-2222-4222-8222-222222222222',
      accountName: 'BCA',
      accountType: 'BANK',
      total: '1000000.00',
      salesTotal: '1000000.00',
      otherTotal: '0.00',
      sharePct: 33.33,
      entryCount: 10,
    },
  ],
  total: '3000000.00',
};

const empty: IncomeByPaymentMethodResponse = {
  period,
  rows: [],
  total: '0.00',
};

describe('IncomeByPaymentMethodView component', () => {
  it('renders one row per account with its share of total income', () => {
    render(<IncomeByPaymentMethodView data={withRows} isLoading={false} />);

    expect(screen.getByText('Kas Toko')).toBeInTheDocument();
    expect(screen.getByText('BCA')).toBeInTheDocument();
    expect(screen.getByText('66,67%')).toBeInTheDocument();
  });

  it('shows the empty state when there is no income in range', () => {
    render(<IncomeByPaymentMethodView data={empty} isLoading={false} />);
    expect(
      screen.getByText('Tidak ada pendapatan pada rentang ini.'),
    ).toBeInTheDocument();
  });
});
