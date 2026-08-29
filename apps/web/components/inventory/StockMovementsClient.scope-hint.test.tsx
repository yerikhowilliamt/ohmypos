import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';
import type { BranchResponse } from '@ohmypos/api-contracts';

const branches = vi.fn();

vi.mock('@/hooks/useInventory', () => ({
  useStockMovements: () => ({
    data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 1 } },
    isLoading: false,
  }),
  fetchStockMovementsPage: vi.fn(async () => ({
    data: [],
    meta: { total: 0, page: 1, limit: 100, totalPages: 1 },
  })),
}));
vi.mock('@/hooks/useMasterData', () => ({
  useRawMaterials: () => ({ data: [] }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => branches(),
}));
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx: vi.fn(),
}));

import { StockMovementsClient } from './StockMovementsClient';

function branch(overrides: Partial<BranchResponse>): BranchResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Kemang',
    address: null,
    isSystem: false,
    isMainStore: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * This filter puts "Semua Cabang" (no filter) one line above rows labelled
 * "Umum" (the ADR-014 attribution row) — the same pair the Owner could not tell
 * apart in the P&L filter (ERR-039).
 */
describe('StockMovementsClient — explaining Umum next to Semua Cabang', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explains Umum when the system location exists', () => {
    branches.mockReturnValue({
      data: [
        branch({}),
        branch({
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Umum',
          isSystem: true,
        }),
      ],
    });

    render(<StockMovementsClient />);

    expect(screen.getByText(/tidak terikat satu cabang/i)).toBeInTheDocument();
    expect(
      screen.getByText(/mencakup seluruh cabang beserta Umum/i),
    ).toBeInTheDocument();
  });

  it('omits the hint when there is no system location to explain', () => {
    branches.mockReturnValue({ data: [branch({})] });

    render(<StockMovementsClient />);

    expect(
      screen.queryByText(/tidak terikat satu cabang/i),
    ).not.toBeInTheDocument();
  });

  it('survives a branches query that has not resolved yet', () => {
    // `useBranches().data` is undefined on first paint; the hint must not throw.
    branches.mockReturnValue({ data: undefined });

    expect(() => render(<StockMovementsClient />)).not.toThrow();
  });
});
