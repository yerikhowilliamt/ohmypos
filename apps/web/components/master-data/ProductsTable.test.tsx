import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { ProductsTable } from './ProductsTable';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

const mockProducts: ProductWithHppResponse[] = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    name: 'Espresso Single',
    sellPrice: '15000.00',
    isActive: true,
    hpp: '3500.00',
    hasRecipe: true,
    margin: '11500.00',
    makeableQuantity: 40,
    recipeItems: [
      {
        rawMaterialId: 'cccccccc-1111-4111-8111-111111111111',
        quantityUsed: '0.0180',
      },
    ],
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    name: 'Matcha Latte',
    sellPrice: '25000.00',
    isActive: false,
    hpp: null,
    hasRecipe: false,
    margin: null,
    makeableQuantity: null,
    recipeItems: [],
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockRawMaterials: RawMaterialResponse[] = [
  {
    id: 'cccccccc-3333-4333-8333-333333333333',
    name: 'Biji Kopi Espresso',
    unit: 'kg',
    unitCost: '150000.00',
    currentStock: '10.0000',
    lowStockThreshold: '2.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

describe('ProductsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders products table with live HPP, margin %, and status badges', () => {
    renderWithClient(
      <ProductsTable
        products={mockProducts}
        rawMaterials={mockRawMaterials}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Espresso Single')).toBeDefined();
    expect(screen.getByText('Matcha Latte')).toBeDefined();
    expect(screen.getByText('Resep aktif')).toBeDefined();
    expect(screen.getByText('Belum ada resep')).toBeDefined();
    expect(screen.getByText('Aktif')).toBeDefined();
    expect(screen.getByText('Nonaktif')).toBeDefined();
    expect(screen.getByText('40 porsi')).toBeDefined();
  });

  it('filters product rows based on search input', () => {
    renderWithClient(
      <ProductsTable
        products={mockProducts}
        rawMaterials={mockRawMaterials}
        isLoading={false}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/cari nama produk/i);
    fireEvent.change(searchInput, { target: { value: 'Matcha' } });

    expect(screen.queryByText('Espresso Single')).toBeNull();
    expect(screen.getByText('Matcha Latte')).toBeDefined();
  });

  it('renders empty state when no products exist', () => {
    renderWithClient(
      <ProductsTable
        products={[]}
        rawMaterials={mockRawMaterials}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/belum ada produk/i)).toBeDefined();
  });

  it('opens ProductFormDialog when clicking Tambah Produk button', () => {
    renderWithClient(
      <ProductsTable
        products={mockProducts}
        rawMaterials={mockRawMaterials}
        isLoading={false}
      />,
    );

    const addBtn = screen.getByRole('button', { name: /tambah produk/i });
    fireEvent.click(addBtn);

    expect(
      screen.getByRole('heading', { name: 'Tambah Produk Baru' }),
    ).toBeDefined();
  });
});
