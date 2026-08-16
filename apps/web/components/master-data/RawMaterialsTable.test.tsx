import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { RawMaterialResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { RawMaterialsTable } from './RawMaterialsTable';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

const mockRawMaterials: RawMaterialResponse[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Biji Kopi Espresso',
    unit: 'kg',
    unitCost: '150000.00',
    currentStock: '1.0000',
    lowStockThreshold: '2.0000', // Low stock!
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Susu UHT Fresh',
    unit: 'liter',
    unitCost: '20000.00',
    currentStock: '0.0000', // Out of stock!
    lowStockThreshold: '2.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Sirup Karamel',
    unit: 'liter',
    unitCost: '45000.00',
    currentStock: '10.0000', // OK stock!
    lowStockThreshold: '1.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

describe('RawMaterialsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders raw materials list with units and warning badges for low/out of stock', () => {
    renderWithClient(
      <RawMaterialsTable materials={mockRawMaterials} isLoading={false} />,
    );

    expect(screen.getByText('Biji Kopi Espresso')).toBeDefined();
    expect(screen.getByText('Susu UHT Fresh')).toBeDefined();
    expect(screen.getByText('Sirup Karamel')).toBeDefined();

    // Badges
    expect(screen.getByText('Rendah')).toBeDefined();
    expect(screen.getByText('Habis')).toBeDefined();
  });

  it('filters raw materials table by search input', () => {
    renderWithClient(
      <RawMaterialsTable materials={mockRawMaterials} isLoading={false} />,
    );

    const searchInput = screen.getByPlaceholderText(/cari bahan baku/i);
    fireEvent.change(searchInput, { target: { value: 'Karamel' } });

    expect(screen.queryByText('Biji Kopi Espresso')).toBeNull();
    expect(screen.getByText('Sirup Karamel')).toBeDefined();
  });

  it('renders empty state when no raw materials exist', () => {
    renderWithClient(<RawMaterialsTable materials={[]} isLoading={false} />);

    expect(screen.getByText('Belum ada bahan baku terdaftar.')).toBeDefined();
  });

  it('opens RawMaterialFormDialog when clicking Tambah Bahan Baku button', () => {
    renderWithClient(
      <RawMaterialsTable materials={mockRawMaterials} isLoading={false} />,
    );

    const addBtn = screen.getByRole('button', { name: /tambah bahan baku/i });
    fireEvent.click(addBtn);

    expect(
      screen.getByRole('heading', { name: 'Tambah Bahan Baku' }),
    ).toBeDefined();
  });
});
