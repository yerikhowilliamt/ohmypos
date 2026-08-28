import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { RawMaterialResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { RawMaterialFormDialog } from './RawMaterialFormDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const mockMaterial: RawMaterialResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Biji Kopi Arabika Gayo',
  unit: 'kg',
  purchaseUnit: 'kg',
  conversionFactor: '1.0000',
  isBaseUnitLocked: false,
  unitCost: '180000.00',
  currentStock: '12.0000',
  lowStockThreshold: '2.5000',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('RawMaterialFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode with empty form and creates raw material on submit', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockMaterial);
    const onOpenChange = vi.fn();

    renderWithClient(
      <RawMaterialFormDialog open={true} onOpenChange={onOpenChange} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Tambah Bahan Baku' }),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText(/nama bahan baku/i), {
      target: { value: 'Susu UHT Fresh' },
    });
    fireEvent.change(screen.getByLabelText('Satuan Stok / Resep'), {
      target: { value: 'ml' },
    });
    fireEvent.change(screen.getByLabelText('Satuan Beli'), {
      target: { value: 'liter' },
    });
    fireEvent.change(screen.getByLabelText('Isi per Satuan Beli'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText(/biaya per satuan stok/i), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByLabelText(/batas peringatan stok rendah/i), {
      target: { value: '5' },
    });

    const submitBtn = screen.getByRole('button', {
      name: /tambah bahan baku/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/raw-materials',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Susu UHT Fresh',
            unit: 'ml',
            purchaseUnit: 'liter',
            conversionFactor: '1000',
            unitCost: '21',
            lowStockThreshold: '5',
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders edit mode with prefilled values and updates raw material on submit', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      ...mockMaterial,
      unitCost: '195000.00',
    });
    const onOpenChange = vi.fn();

    renderWithClient(
      <RawMaterialFormDialog
        open={true}
        onOpenChange={onOpenChange}
        material={mockMaterial}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Edit Bahan Baku' }),
    ).toBeDefined();
    expect(screen.getByLabelText(/nama bahan baku/i)).toHaveValue(
      mockMaterial.name,
    );
    expect(screen.getByLabelText('Satuan Stok / Resep')).toHaveValue(
      mockMaterial.unit,
    );
    expect(screen.getByLabelText('Satuan Beli')).toHaveValue(
      mockMaterial.purchaseUnit,
    );
    expect(screen.getByLabelText(/biaya per satuan stok/i)).toHaveValue(
      '180.000',
    );

    // Change unit cost
    fireEvent.change(screen.getByLabelText(/biaya per satuan stok/i), {
      target: { value: '195000' },
    });

    const submitBtn = screen.getByRole('button', { name: /simpan perubahan/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/raw-materials/${mockMaterial.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            name: mockMaterial.name,
            unit: mockMaterial.unit,
            purchaseUnit: mockMaterial.purchaseUnit,
            conversionFactor: mockMaterial.conversionFactor,
            unitCost: '195000',
            lowStockThreshold: mockMaterial.lowStockThreshold,
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('displays validation errors on invalid inputs', async () => {
    renderWithClient(
      <RawMaterialFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /tambah bahan baku/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });

    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });

  it('locks the stock unit and explains why once the material has stock history', () => {
    // ADR-024: changing the base unit would re-scale currentStock, every recipe
    // line, and the append-only movement log. The server returns 400; disabling
    // the field is what stops the user typing a change they cannot save.
    renderWithClient(
      <RawMaterialFormDialog
        open={true}
        onOpenChange={vi.fn()}
        material={{ ...mockMaterial, isBaseUnitLocked: true }}
      />,
    );

    expect(screen.getByLabelText('Satuan Stok / Resep')).toBeDisabled();
    // Packaging stays editable — that is the whole point of splitting it out.
    expect(screen.getByLabelText('Satuan Beli')).not.toBeDisabled();
    expect(screen.getByLabelText('Isi per Satuan Beli')).not.toBeDisabled();
    expect(
      screen.getByText(/terkunci karena sudah ada riwayat stok/i),
    ).toBeDefined();
  });

  it('previews the conversion as the user types it', () => {
    renderWithClient(
      <RawMaterialFormDialog
        open={true}
        onOpenChange={vi.fn()}
        material={{
          ...mockMaterial,
          unit: 'gram',
          purchaseUnit: 'kg',
          conversionFactor: '1000',
        }}
      />,
    );

    expect(screen.getByTestId('rm-conversion-hint').textContent).toBe(
      '1 kg = 1000 gram',
    );
  });
});
