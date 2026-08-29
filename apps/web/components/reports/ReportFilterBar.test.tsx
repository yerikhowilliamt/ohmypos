import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { ReportFilterBar } from './ReportFilterBar';
import type { BranchResponse } from '@ohmypos/api-contracts';

const branches: BranchResponse[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Kemang',
    address: null,
    isSystem: false,
    isMainStore: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Umum',
    address: null,
    isSystem: true,
    isMainStore: false,
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
    expect(
      within(screen.getByRole('combobox')).getByText('Semua Cabang'),
    ).toBeInTheDocument();
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

describe('ReportFilterBar — the system location must not read like "all branches"', () => {
  it('keeps the sentinel and the system location visibly distinct', () => {
    // The system location was first named `Umum (Semua Cabang)`, which put two
    // near-opposite meanings in one dropdown: "Semua Cabang" = no filter at all,
    // `Umum (Semua Cabang)` = that single row. The Owner spotted it in the P&L
    // filter. Renaming any branch back into a "Semua Cabang" shape fails here.
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

    for (const branch of branches) {
      expect(branch.name).not.toContain('Semua Cabang');
    }
  });

  it('spells out what Umum means whenever the system location is listed', () => {
    // Renaming alone was not enough: `Umum` and `Semua Cabang` still read as
    // synonyms to an Owner. The hint states the containment relationship —
    // Semua Cabang is the superset that already includes Umum.
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

    expect(
      screen.getByText(/tidak dibebankan ke satu cabang/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/mencakup seluruh cabang beserta Umum/i),
    ).toBeInTheDocument();
  });

  it('omits the hint when there is no system location to explain', () => {
    render(
      <ReportFilterBar
        startDate="2026-08-01"
        endDate="2026-08-18"
        branches={branches.filter((b) => !b.isSystem)}
        onStartDateChange={noop}
        onEndDateChange={noop}
        onBranchChange={noop}
      />,
    );

    expect(
      screen.queryByText(/tidak dibebankan ke satu cabang/i),
    ).not.toBeInTheDocument();
  });
});
