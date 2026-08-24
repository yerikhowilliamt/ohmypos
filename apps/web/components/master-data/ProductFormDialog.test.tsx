import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { ProductFormDialog } from './ProductFormDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const mockProduct: ProductWithHppResponse = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  name: 'Caramel Macchiato',
  sellPrice: '28000.00',
  isActive: true,
  hpp: '12000.00',
  hasRecipe: true,
  margin: '16000.00',
  makeableQuantity: 20,
  recipeItems: [
    {
      rawMaterialId: 'bbbbbbbb-1111-4111-8111-111111111111',
      quantityUsed: '0.0180',
    },
  ],
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('ProductFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode and creates product on submit', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockProduct);
    const onOpenChange = vi.fn();

    renderWithClient(
      <ProductFormDialog open={true} onOpenChange={onOpenChange} />,
    );

    expect(screen.getByText('Tambah Produk Baru')).toBeDefined();

    fireEvent.change(screen.getByLabelText(/nama produk \/ menu/i), {
      target: { value: 'Caramel Macchiato' },
    });
    fireEvent.change(screen.getByLabelText(/harga jual/i), {
      target: { value: '28000' },
    });

    const submitBtn = screen.getByRole('button', { name: /tambah produk/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/products',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Caramel Macchiato',
            sellPrice: '28000',
            isActive: true,
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders edit mode with prefilled values and live HPP card', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      ...mockProduct,
      sellPrice: '30000.00',
    });
    const onOpenChange = vi.fn();

    renderWithClient(
      <ProductFormDialog
        open={true}
        onOpenChange={onOpenChange}
        product={mockProduct}
      />,
    );

    expect(screen.getByText('Edit Produk')).toBeDefined();
    expect(screen.getByLabelText(/nama produk \/ menu/i)).toHaveValue(
      mockProduct.name,
    );
    expect(screen.getByLabelText(/harga jual/i)).toHaveValue('28.000');

    // Shows live HPP and margin info
    expect(screen.getByText(/informasi resep & biaya/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/harga jual/i), {
      target: { value: '30000' },
    });

    const submitBtn = screen.getByRole('button', { name: /simpan perubahan/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/products/${mockProduct.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            name: mockProduct.name,
            sellPrice: '30000',
            isActive: true,
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('validates empty inputs and prevents submission', async () => {
    renderWithClient(<ProductFormDialog open={true} onOpenChange={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /tambah produk/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });

    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });
});
