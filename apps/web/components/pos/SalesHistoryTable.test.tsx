import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { SaleResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
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
    soldAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(), // 10 mins ago
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
    status: 'COMPLETED',
    voidedAt: null,
    voidedByUserId: null,
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

vi.mock('@/hooks/usePos', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useVoidSale: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

describe('SalesHistoryTable', () => {
  it('renders sales history data and opens receipt dialog on click', () => {
    renderWithClient(<SalesHistoryTable sales={mockSales} {...singlePage} />);

    expect(screen.getByText('Cabang Tebet')).toBeDefined();
    expect(screen.getByText('Budi Kasir')).toBeDefined();
    expect(screen.getByText('QRIS')).toBeDefined();

    expect(screen.getByRole('button', { name: /struk/i })).toBeDefined();

    const strukBtn = screen.getByRole('button', { name: /struk/i });
    fireEvent.click(strukBtn);

    expect(screen.getByText(/Cabang Cabang Tebet/i)).toBeDefined();
    expect(screen.getByText('Kopi Susu Gula Aren')).toBeDefined();
  });

  it('shows void button for ADMIN/OWNER for recent sales', () => {
    renderWithClient(
      <SalesHistoryTable userRole="ADMIN" sales={mockSales} {...singlePage} />,
    );
    expect(screen.getByRole('button', { name: /batalkan/i })).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: /batalkan/i })
        .hasAttribute('disabled'),
    ).toBeFalsy();
  });

  it('hides void button for KASIR', () => {
    renderWithClient(
      <SalesHistoryTable userRole="KASIR" sales={mockSales} {...singlePage} />,
    );
    expect(screen.queryByRole('button', { name: /batalkan/i })).toBeNull();
  });

  it('disables void button if sale is older than 30 minutes', () => {
    const oldSale = {
      ...mockSales[0],
      soldAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(), // 40 mins ago
    };
    renderWithClient(
      <SalesHistoryTable userRole="OWNER" sales={[oldSale]} {...singlePage} />,
    );
    const btn = screen.getByRole('button', { name: /batalkan/i });
    expect(btn).toBeDefined();
    expect(btn.hasAttribute('disabled')).toBeTruthy();
  });

  it('hides void button if sale is already voided and shows badge', () => {
    const voidedSale = {
      ...mockSales[0],
      status: 'VOIDED' as const,
    };
    renderWithClient(
      <SalesHistoryTable
        userRole="ADMIN"
        sales={[voidedSale]}
        {...singlePage}
      />,
    );
    expect(screen.queryByRole('button', { name: /batalkan/i })).toBeNull();
    expect(screen.getByText('Dibatalkan')).toBeDefined();
  });

  it('opens confirmation dialog on void click', () => {
    renderWithClient(
      <SalesHistoryTable userRole="ADMIN" sales={mockSales} {...singlePage} />,
    );
    const btn = screen.getByRole('button', { name: /batalkan/i });
    fireEvent.click(btn);
    expect(
      screen.getByText(/Apakah Anda yakin ingin membatalkan/i),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Ya, Batalkan/i })).toBeDefined();
  });
});
