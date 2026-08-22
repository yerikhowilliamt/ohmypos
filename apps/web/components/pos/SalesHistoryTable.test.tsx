import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SaleResponse } from '@ohmypos/api-contracts';
import { SalesHistoryTable } from './SalesHistoryTable';

const mockSales: SaleResponse[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222222',
    branchName: 'Cabang Tebet',
    accountId: '33333333-3333-3333-3333-333333333333',
    accountName: 'QRIS',
    userId: '44444444-4444-4444-4444-444444444444',
    cashierName: 'Budi Kasir',
    ledgerEntryId: '55555555-5555-5555-5555-555555555555',
    totalAmount: '45000',
    totalHpp: '20000',
    grossMargin: '25000',
    soldAt: '2026-08-19T10:00:00.000Z',
    items: [
      {
        id: '66666666-6666-6666-6666-666666666666',
        productId: '77777777-7777-7777-7777-777777777777',
        productName: 'Kopi Susu Gula Aren',
        quantity: '2',
        unitPriceAtSale: '22500',
        isPriceOverridden: false,
        hppAtSale: '10000',
        lineTotal: '45000',
      },
    ],
    createdAt: '2026-08-19T10:00:00.000Z',
    updatedAt: '2026-08-19T10:00:00.000Z',
  },
];

/** Sorting, pagination and search are server-driven now, so the table takes
 * them as controlled props (TASK-067, TASK-072). These are the single-page
 * defaults. */
const singlePage = {
  sorting: [{ id: 'soldAt', desc: true }],
  onSortingChange: vi.fn(),
  search: '',
  onSearchChange: vi.fn(),
  pagination: {
    meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    onPageChange: vi.fn(),
    itemNoun: 'transaksi',
  },
};

describe('SalesHistoryTable', () => {
  it('renders sales history data and opens receipt dialog on click', () => {
    render(<SalesHistoryTable sales={mockSales} {...singlePage} />);

    expect(screen.getByText('Cabang Tebet')).toBeDefined();
    expect(screen.getByText('Budi Kasir')).toBeDefined();
    expect(screen.getByText('QRIS')).toBeDefined();

    expect(screen.getByRole('button', { name: /struk/i })).toBeDefined();

    const strukBtn = screen.getByRole('button', { name: /struk/i });
    fireEvent.click(strukBtn);

    expect(screen.getByText(/Cabang Cabang Tebet/i)).toBeDefined();
    expect(screen.getByText('Kopi Susu Gula Aren')).toBeDefined();
  });
});
