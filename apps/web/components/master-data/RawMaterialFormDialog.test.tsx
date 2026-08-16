import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { RawMaterialResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { RawMaterialFormDialog } from './RawMaterialFormDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

const mockMaterial: RawMaterialResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Biji Kopi Arabika Gayo',
  unit: 'kg',
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
    fireEvent.change(screen.getByLabelText(/satuan \(unit\)/i), {
      target: { value: 'liter' },
    });
    fireEvent.change(screen.getByLabelText(/biaya per satuan/i), {
      target: { value: '21000' },
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
            unit: 'liter',
            unitCost: '21000',
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
    expect(screen.getByLabelText(/satuan \(unit\)/i)).toHaveValue(
      mockMaterial.unit,
    );
    expect(screen.getByLabelText(/biaya per satuan/i)).toHaveValue('180.000');

    // Change unit cost
    fireEvent.change(screen.getByLabelText(/biaya per satuan/i), {
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
});
