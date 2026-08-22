import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ProfitLossResponse } from '@ohmypos/api-contracts';

const exportRowsToXlsx = vi.hoisted(() =>
  vi.fn<(filename: string, columns: unknown, rows: unknown[]) => Promise<void>>(
    async () => undefined,
  ),
);
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx,
}));

import { ProfitLossView } from './ProfitLossView';

const report = {
  period: {
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    timezone: 'Asia/Jakarta',
    dayCount: 31,
    branchId: null,
    branchName: null,
  },
  salesRevenue: '412860000.00',
  otherIncome: '0.00',
  totalIncome: '412860000.00',
  cogs: '210000000.00',
  grossProfit: '202860000.00',
  operatingExpenses: '106300000.00',
  netProfit: '96560000.00',
  grossMarginPct: '49.14',
  netMarginPct: '23.39',
  saleCount: 1200,
  cash: {
    totalInflow: '412860000.00',
    totalOutflow: '106300000.00',
    materialCashOutflow: '50000000.00',
    netCashFlow: '306560000.00',
  },
} as unknown as ProfitLossResponse;

async function exportWith(startDate: string, endDate: string): Promise<string> {
  exportRowsToXlsx.mockClear();
  const { unmount } = render(
    <ProfitLossView
      data={report}
      isLoading={false}
      filters={{ startDate, endDate }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /export/i }));
  await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());
  const filename = exportRowsToXlsx.mock.calls[0]![0];
  unmount();
  return filename;
}

/**
 * DEBT-025. The five report views named their file after the day the button was
 * pressed, not the period the data covers — so exporting January and February
 * on the same afternoon produced two files with the same name, the second
 * silently replacing the first in Downloads.
 */
describe('report export filenames carry the selected range', () => {
  beforeEach(() => {
    exportRowsToXlsx.mockClear();
  });

  it('names the file after the range, not today', async () => {
    const filename = await exportWith('2026-01-01', '2026-01-31');

    expect(filename).toBe('laba-rugi_2026-01-01_sd_2026-01-31.xlsx');
    // Explicitly NOT the export-time date.
    expect(filename).not.toContain(new Date().toISOString().slice(0, 10));
  });

  it('gives two different ranges two different filenames', async () => {
    const january = await exportWith('2026-01-01', '2026-01-31');
    const february = await exportWith('2026-02-01', '2026-02-28');

    expect(january).not.toBe(february);
  });
});
