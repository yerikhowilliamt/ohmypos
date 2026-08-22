import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { StockMovementResponse } from '@ohmypos/api-contracts';
import { StockMovementsTable } from './StockMovementsTable';

function movement(
  overrides: Partial<StockMovementResponse> = {},
): StockMovementResponse {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    rawMaterialId: '22222222-2222-2222-2222-222222222222',
    rawMaterialName: 'Kopi Arabika',
    rawMaterialUnit: 'kg',
    branchId: '33333333-3333-3333-3333-333333333333',
    branchName: 'Cabang Tebet',
    direction: 'OUT',
    quantity: '2.5000',
    referenceType: 'SALE',
    referenceId: 'sale-1',
    unitCostAtMovement: '120000',
    movementDate: '2026-08-19T10:00:00.000Z',
    createdAt: '2026-08-19T10:00:00.000Z',
    ...overrides,
  };
}

/** Sorting and paging are server-driven, so the table takes them as controlled
 * props. These are the single-page defaults. */
function singlePage(total = 1) {
  return {
    sorting: [{ id: 'movementDate', desc: true }],
    onSortingChange: vi.fn(),
    pagination: {
      meta: { total, page: 1, limit: 10, totalPages: 1 },
      onPageChange: vi.fn(),
      itemNoun: 'pergerakan',
    },
  };
}

describe('StockMovementsTable', () => {
  it('renders a row per movement with material, quantity + unit, and cost', () => {
    render(<StockMovementsTable movements={[movement()]} {...singlePage()} />);

    expect(screen.getByText('Kopi Arabika')).toBeDefined();
    expect(screen.getByText('kg')).toBeDefined();
    expect(screen.getByText('Cabang Tebet')).toBeDefined();
    expect(screen.getByText('Penjualan')).toBeDefined();
  });

  it('renders a central movement as "Pusat", not as a blank cell', () => {
    // branchId null is a central event (ADR-004) — a stock-take or a central
    // purchase — not missing data. Most of this table, in fact.
    render(
      <StockMovementsTable
        movements={[
          movement({
            branchId: null,
            branchName: null,
            referenceType: 'OPENING',
          }),
        ]}
        {...singlePage()}
      />,
    );

    expect(screen.getByText('Pusat')).toBeDefined();
    expect(screen.getByText('Stok Awal')).toBeDefined();
  });

  it('labels every reference type in Indonesian', () => {
    render(
      <StockMovementsTable
        movements={[
          movement({ id: 'a', referenceType: 'SALE' }),
          movement({ id: 'b', referenceType: 'PURCHASE' }),
          movement({ id: 'c', referenceType: 'OPENING' }),
          movement({ id: 'd', referenceType: 'ADJUSTMENT' }),
        ]}
        {...singlePage(4)}
      />,
    );

    expect(screen.getByText('Penjualan')).toBeDefined();
    expect(screen.getByText('Pembelian')).toBeDefined();
    expect(screen.getByText('Stok Awal')).toBeDefined();
    expect(screen.getByText('Penyesuaian')).toBeDefined();
  });

  it('carries direction in TEXT, not in colour alone', () => {
    // DESIGN.md §12.2 + §22: colour is never the sole carrier of meaning, and
    // the gold/accent palette does not clear 4.5:1 on small glyphs anyway. If
    // this assertion is ever satisfied only by a class name, the indicator has
    // regressed to colour-only.
    render(
      <StockMovementsTable
        movements={[
          movement({ id: 'in', direction: 'IN' }),
          movement({ id: 'out', direction: 'OUT' }),
        ]}
        {...singlePage(2)}
      />,
    );

    expect(screen.getByText('Masuk')).toBeDefined();
    expect(screen.getByText('Keluar')).toBeDefined();
  });

  it('hands sorting to the server and does NOT reorder rows itself', () => {
    const onSortingChange = vi.fn();
    const rows = [
      movement({ id: 'big', rawMaterialName: 'Zebra', quantity: '99.0000' }),
      movement({ id: 'small', rawMaterialName: 'Alpha', quantity: '1.0000' }),
    ];

    render(
      <StockMovementsTable
        movements={rows}
        sorting={[{ id: 'movementDate', desc: true }]}
        onSortingChange={onSortingChange}
        pagination={{
          meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
          onPageChange: vi.fn(),
          itemNoun: 'pergerakan',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /jumlah/i }));
    expect(onSortingChange).toHaveBeenCalled();

    // Row order still follows `movements`, unsorted by the component. With one
    // page in hand, a client-side sort would reorder ten rows while claiming to
    // have sorted the whole set.
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(bodyRows[0]).getByText('Zebra')).toBeDefined();
    expect(within(bodyRows[1]).getByText('Alpha')).toBeDefined();
  });

  it('reports the SERVER total in the footer, not the rows on screen', () => {
    render(
      <StockMovementsTable
        movements={[movement()]}
        sorting={[{ id: 'movementDate', desc: true }]}
        onSortingChange={vi.fn()}
        pagination={{
          meta: { total: 594, page: 1, limit: 10, totalPages: 60 },
          onPageChange: vi.fn(),
          itemNoun: 'pergerakan',
        }}
      />,
    );

    expect(screen.getByText(/594/)).toBeDefined();
    expect(screen.getByText(/60/)).toBeDefined();
  });

  it('labels the search as page-scoped, since that is all it covers', () => {
    // DEBT-047: the toolbar filter runs over the current page only. The
    // placeholder must not imply a full-history search the backend has not got.
    render(<StockMovementsTable movements={[movement()]} {...singlePage()} />);

    expect(
      screen.getByPlaceholderText('Cari bahan di halaman ini...'),
    ).toBeDefined();
  });
});
