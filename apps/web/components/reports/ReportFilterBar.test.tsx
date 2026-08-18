import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ReportFilterBar } from './ReportFilterBar';
import type { BranchResponse } from '@ohmypos/api-contracts';

const branches: BranchResponse[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Kemang',
    address: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function noop() {}

describe('ReportFilterBar component', () => {
  it('renders both date filters and the branch filter', () => {
    render(
      <ReportFilterBar
        startDate="2026-08-01"
        endDate="2026-08-18"
        branches={branches}
        onStartDateChange={noop}
        onEndDateChange={noop}
        onBranchChange={noop}
      />,
    );

    expect(screen.getByText('Dari Tanggal')).toBeInTheDocument();
    expect(screen.getByText('Sampai Tanggal')).toBeInTheDocument();
    expect(screen.getByText('Cabang')).toBeInTheDocument();
    expect(screen.getByText('Semua Cabang')).toBeInTheDocument();
  });

  it('shows an inline error when endDate precedes startDate', () => {
    render(
      <ReportFilterBar
        startDate="2026-08-18"
        endDate="2026-08-01"
        branches={branches}
        onStartDateChange={noop}
        onEndDateChange={noop}
        onBranchChange={noop}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/tidak boleh sebelum/i);
  });

  it('shows no error for a valid range', () => {
    render(
      <ReportFilterBar
        startDate="2026-08-01"
        endDate="2026-08-18"
        branches={branches}
        onStartDateChange={noop}
        onEndDateChange={noop}
        onBranchChange={noop}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows no error while either date is still unset', () => {
    render(
      <ReportFilterBar
        startDate=""
        endDate=""
        branches={branches}
        onStartDateChange={noop}
        onEndDateChange={noop}
        onBranchChange={noop}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('respects the disabled prop on the branch select', () => {
    render(
      <ReportFilterBar
        startDate="2026-08-01"
        endDate="2026-08-18"
        branches={branches}
        onStartDateChange={noop}
        onEndDateChange={noop}
        onBranchChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
