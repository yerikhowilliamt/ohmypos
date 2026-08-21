import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
  RecipeEnvelopeResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { RecipeEditorDialog } from './RecipeEditorDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

const mockProduct: ProductWithHppResponse = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  name: 'Kopi Susu Aren',
  sellPrice: '20000.00',
  isActive: true,
  hpp: '8500.00',
  hasRecipe: true,
  margin: '11500.00',
  makeableQuantity: 15,
  recipeItems: [
    {
      rawMaterialId: 'bbbbbbbb-1111-4111-8111-111111111111',
      quantityUsed: '0.0180',
    },
    {
      rawMaterialId: 'cccccccc-2222-4222-8222-222222222222',
      quantityUsed: '0.1500',
    },
  ],
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

const mockRawMaterials: RawMaterialResponse[] = [
  {
    id: 'bbbbbbbb-1111-4111-8111-111111111111',
    name: 'Biji Kopi Espresso',
    unit: 'kg',
    unitCost: '150000.00',
    currentStock: '5.0000',
    lowStockThreshold: '1.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: 'cccccccc-2222-4222-8222-222222222222',
    name: 'Susu UHT Fresh',
    unit: 'liter',
    unitCost: '20000.00',
    currentStock: '10.0000',
    lowStockThreshold: '2.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: 'dddddddd-3333-4333-8333-333333333333',
    name: 'Sirup Gula Aren',
    unit: 'liter',
    unitCost: '35000.00',
    currentStock: '3.0000',
    lowStockThreshold: '1.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockRecipeEnvelope: RecipeEnvelopeResponse = {
  recipe: {
    productId: mockProduct.id,
    hasRecipe: true,
    hpp: '8500.00',
    items: [
      {
        id: 'eeeeeeee-1111-4111-8111-111111111111',
        rawMaterialId: mockRawMaterials[0].id,
        rawMaterialName: mockRawMaterials[0].name,
        unit: mockRawMaterials[0].unit,
        quantityUsed: '0.0200',
        unitCost: '150000.00',
        lineCost: '3000.00',
      },
      {
        id: 'eeeeeeee-2222-4222-8222-222222222222',
        rawMaterialId: mockRawMaterials[1].id,
        rawMaterialName: mockRawMaterials[1].name,
        unit: mockRawMaterials[1].unit,
        quantityUsed: '0.1500',
        unitCost: '20000.00',
        lineCost: '3000.00',
      },
    ],
  },
  product: mockProduct,
};

const emptyRecipeEnvelope: RecipeEnvelopeResponse = {
  recipe: {
    productId: mockProduct.id,
    hasRecipe: false,
    hpp: null,
    items: [],
  },
  product: { ...mockProduct, hasRecipe: false, hpp: null },
};

describe('RecipeEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and displays existing recipe items and live HPP header', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockRecipeEnvelope);

    renderWithClient(
      <RecipeEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        product={mockProduct}
        rawMaterials={mockRawMaterials}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /resep \/ komposisi/i }),
    ).toBeDefined();

    expect(await screen.findByTestId('raw-material-select-0')).toBeDefined();
    expect(screen.getByTestId('quantity-input-0')).toHaveValue('0.0200');
    expect(screen.getByTestId('raw-material-select-1')).toBeDefined();
    expect(screen.getByTestId('quantity-input-1')).toHaveValue('0.1500');
  });

  it('allows adding and removing recipe ingredient rows', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(emptyRecipeEnvelope);

    renderWithClient(
      <RecipeEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        product={mockProduct}
        rawMaterials={mockRawMaterials}
      />,
    );

    expect(
      await screen.findByText(/belum ada bahan baku yang ditambahkan/i),
    ).toBeDefined();

    // Click add button
    const addBtn = screen.getByTestId('add-ingredient-btn');
    fireEvent.click(addBtn);

    expect(await screen.findByTestId('recipe-row-0')).toBeDefined();

    // Remove row
    const removeBtn = screen.getByTestId('remove-ingredient-btn-0');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('recipe-row-0')).toBeNull();
    });
  });

  it('validates strictly positive quantity used and prevents submission', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(emptyRecipeEnvelope);

    renderWithClient(
      <RecipeEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        product={mockProduct}
        rawMaterials={mockRawMaterials}
      />,
    );

    expect(
      await screen.findByText(/belum ada bahan baku yang ditambahkan/i),
    ).toBeDefined();

    fireEvent.click(screen.getByTestId('add-ingredient-btn'));

    const select = await screen.findByTestId('raw-material-select-0');
    fireEvent.change(select, {
      target: { value: mockRawMaterials[0].id },
    });

    const qtyInput = screen.getByTestId('quantity-input-0');
    fireEvent.change(qtyInput, { target: { value: '0' } });

    const submitBtn = screen.getByRole('button', {
      name: /simpan & hitung hpp/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/must be greater than zero/i)).toBeDefined();
    });

    expect(apiModule.apiFetch).toHaveBeenCalledTimes(1); // Only the initial GET
  });

  it('rejects duplicate raw materials in the same recipe', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(emptyRecipeEnvelope);

    renderWithClient(
      <RecipeEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        product={mockProduct}
        rawMaterials={mockRawMaterials}
      />,
    );

    expect(
      await screen.findByText(/belum ada bahan baku yang ditambahkan/i),
    ).toBeDefined();

    // Add row 1
    fireEvent.click(screen.getByTestId('add-ingredient-btn'));
    expect(await screen.findByTestId('raw-material-select-0')).toBeDefined();

    // Add row 2
    fireEvent.click(screen.getByTestId('add-ingredient-btn'));
    expect(await screen.findByTestId('raw-material-select-1')).toBeDefined();

    const select0 = screen.getByTestId('raw-material-select-0');
    fireEvent.click(select0);
    const opt0 = await screen.findByRole('option', {
      name: /Biji Kopi Espresso/,
    });
    fireEvent.click(opt0);

    const select1 = screen.getByTestId('raw-material-select-1');
    fireEvent.click(select1);
    const opt1 = await screen.findByRole('option', {
      name: /Biji Kopi Espresso/,
    });
    fireEvent.click(opt1);

    const qtyInput0 = screen.getByTestId('quantity-input-0');
    const qtyInput1 = screen.getByTestId('quantity-input-1');
    fireEvent.change(qtyInput0, { target: { value: '0.02' } });
    fireEvent.change(qtyInput1, { target: { value: '0.05' } });

    const submitBtn = screen.getByRole('button', {
      name: /simpan & hitung hpp/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/duplicate rawmaterialid in the same recipe/i),
      ).toBeDefined();
    });
  });

  it('successfully submits valid recipe and calls PUT /products/:id/recipe', async () => {
    vi.mocked(apiModule.apiFetch)
      .mockResolvedValueOnce(emptyRecipeEnvelope)
      .mockResolvedValueOnce(mockRecipeEnvelope);

    const onOpenChange = vi.fn();

    renderWithClient(
      <RecipeEditorDialog
        open={true}
        onOpenChange={onOpenChange}
        product={mockProduct}
        rawMaterials={mockRawMaterials}
      />,
    );

    expect(
      await screen.findByText(/belum ada bahan baku yang ditambahkan/i),
    ).toBeDefined();

    fireEvent.click(screen.getByTestId('add-ingredient-btn'));

    const select = await screen.findByTestId('raw-material-select-0');
    fireEvent.click(select);
    const opt = await screen.findByRole('option', {
      name: /Sirup Gula Aren/,
    });
    fireEvent.click(opt);

    const qtyInput = screen.getByTestId('quantity-input-0');
    fireEvent.change(qtyInput, { target: { value: '0.03' } });

    const submitBtn = screen.getByRole('button', {
      name: /simpan & hitung hpp/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/products/${mockProduct.id}/recipe`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            items: [
              {
                rawMaterialId: mockRawMaterials[2].id,
                quantityUsed: '0.03',
              },
            ],
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
