import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { CategoryFilterRow } from './CategoryFilterRow';
import { ProductGrid } from './ProductGrid';
import { countByBucket } from '@/lib/pos/product-filters';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function product(
  overrides: Partial<ProductWithHppResponse> & { id: string; name: string },
): ProductWithHppResponse {
  return {
    sellPrice: '20000.00',
    isActive: true,
    hpp: '8000.00',
    hasRecipe: true,
    margin: '12000.00',
    makeableQuantity: 10,
    photoUrl: null,
    recipeItems: [],
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

const kopi = product({ id: 'p1', name: 'Es Kopi Susu' });
const air = product({
  id: 'p2',
  name: 'Air Mineral',
  hasRecipe: false,
  hpp: null,
});
const headroom = new Map<string, number | null>([
  ['p1', 4],
  ['p2', null],
]);

describe('CategoryFilterRow', () => {
  it('renders one bordered card per bucket with its count', () => {
    render(
      <CategoryFilterRow
        buckets={countByBucket([kopi, air], headroom)}
        selected="ALL"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('pos-filter-ALL')).toHaveTextContent(
      'Semua Produk',
    );
    expect(screen.getByTestId('pos-filter-ALL')).toHaveTextContent('2 item');
    expect(screen.getByTestId('pos-filter-NO_RECIPE')).toHaveTextContent(
      '1 item',
    );
  });

  it('marks the selected card with a brand border, not a pill fill', () => {
    render(
      <CategoryFilterRow
        buckets={countByBucket([kopi, air], headroom)}
        selected="READY"
        onSelect={() => {}}
      />,
    );
    const selected = screen.getByTestId('pos-filter-READY');
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected.className).toContain('border-brand-primary');
    expect(selected.className).toContain('bg-surface-strong');
    // §22: not a pill.
    expect(selected.className).not.toContain('rounded-pill');
  });

  it('reports the chosen bucket', () => {
    const onSelect = vi.fn();
    render(
      <CategoryFilterRow
        buckets={countByBucket([kopi, air], headroom)}
        selected="ALL"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('pos-filter-OUT'));
    expect(onSelect).toHaveBeenCalledWith('OUT');
  });
});

describe('ProductGrid', () => {
  const base = {
    headroom,
    inCartQuantities: new Map<string, number>(),
    highlightedProductId: null,
    isLoading: false,
    error: null,
    isFiltered: false,
    onAdd: () => {},
  };

  it('shows the Add New Product card only when the role can create products', () => {
    const { rerender } = render(
      <ProductGrid {...base} products={[kopi]} canCreateProducts />,
    );
    expect(screen.getByTestId('pos-add-product')).toBeInTheDocument();

    rerender(
      <ProductGrid {...base} products={[kopi]} canCreateProducts={false} />,
    );
    expect(screen.queryByTestId('pos-add-product')).toBeNull();
  });

  it('places the Add card in the grid first cell', () => {
    render(<ProductGrid {...base} products={[kopi]} canCreateProducts />);
    const grid = screen.getByTestId('pos-product-grid');
    expect(grid.firstElementChild).toHaveAttribute(
      'data-testid',
      'pos-add-product',
    );
  });

  it('marks the highlighted product with a brand border', () => {
    render(
      <ProductGrid
        {...base}
        products={[kopi]}
        canCreateProducts={false}
        highlightedProductId="p1"
      />,
    );
    const card = screen.getByTestId('product-card-p1');
    expect(card).toHaveAttribute('data-highlighted', 'true');
    expect(card.className).toContain('border-brand-primary');
  });

  it('distinguishes a no-result state from an empty catalogue', () => {
    const { rerender } = render(
      <ProductGrid
        {...base}
        products={[]}
        canCreateProducts={false}
        isFiltered
      />,
    );
    expect(
      screen.getByText(
        'Tidak ada produk yang cocok dengan pencarian atau filter ini.',
      ),
    ).toBeInTheDocument();

    rerender(<ProductGrid {...base} products={[]} canCreateProducts={false} />);
    expect(
      screen.getByText(
        'Belum ada produk aktif. Tambahkan produk di Data Master.',
      ),
    ).toBeInTheDocument();
  });
});
