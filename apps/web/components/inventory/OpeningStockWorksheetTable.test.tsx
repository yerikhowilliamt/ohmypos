import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { OpeningStockWorksheetTable } from './OpeningStockWorksheetTable';
import type { OpeningStockWorksheetRow } from '@ohmypos/api-contracts';

describe('OpeningStockWorksheetTable component', () => {
  const mockRows: OpeningStockWorksheetRow[] = [
    {
      rawMaterialId: '11111111-1111-4111-8111-111111111111',
      name: 'Biji Kopi Arabika',
      unit: 'kg',
      carryForwardQuantity: '10.0000',
      declaredQuantity: '12.0000',
      declaredUnitPrice: null,
      requiresUnitPrice: false, // Purchase already exists
      currentUnitCost: '150000',
    },
    {
      rawMaterialId: '22222222-2222-4222-8222-222222222222',
      name: 'Susu UHT Fresh',
      unit: 'liter',
      carryForwardQuantity: '5.0000',
      declaredQuantity: null,
      declaredUnitPrice: null,
      requiresUnitPrice: true, // No purchase in period -> requires manual unitPrice
      currentUnitCost: '20000',
    },
  ];

  it('renders worksheet rows with material names, units, and carry-forward quantities', () => {
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={mockRows}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Biji Kopi Arabika')).toBeInTheDocument();
    expect(screen.getByText('Susu UHT Fresh')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.getByText('liter')).toBeInTheDocument();
    expect(screen.getByText('10 kg')).toBeInTheDocument();
    expect(screen.getByText('5 liter')).toBeInTheDocument();

    // Checked locked badge vs helper text
    expect(screen.getByText('Otomatis (Pembelian)')).toBeInTheDocument();
    expect(
      screen.getByText('Belum ada pembelian periode ini'),
    ).toBeInTheDocument();
  });

  it('enables unit price input when requiresUnitPrice is true and locks it when false', () => {
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={mockRows}
        onSubmit={vi.fn()}
      />,
    );

    // Biji Kopi Arabika should not have a price input
    expect(
      screen.queryByLabelText('Harga satuan Biji Kopi Arabika'),
    ).not.toBeInTheDocument();

    // Susu UHT Fresh should have a price input
    const susuPriceInput = screen.getByLabelText('Harga satuan Susu UHT Fresh');
    expect(susuPriceInput).toBeInTheDocument();
    expect(susuPriceInput).toHaveValue('20.000'); // prefilled with currentUnitCost
  });

  it('pre-fills declaredQuantity when present, and leaves empty with carryForwardQuantity as placeholder', () => {
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={mockRows}
        onSubmit={vi.fn()}
      />,
    );

    const kopiQtyInput = screen.getByLabelText('Stok fisik Biji Kopi Arabika');
    const susuQtyInput = screen.getByLabelText('Stok fisik Susu UHT Fresh');

    expect(kopiQtyInput).toHaveValue('12'); // formatted without trailing .0000
    expect(susuQtyInput).toHaveValue(''); // no default value, only placeholder
    expect(susuQtyInput).toHaveAttribute('placeholder', '5'); // placeholder from carryForwardQuantity
  });

  it('submits valid form data correctly on save button click', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={mockRows}
        onSubmit={handleSubmit}
      />,
    );

    const susuQtyInput = screen.getByLabelText('Stok fisik Susu UHT Fresh');
    fireEvent.change(susuQtyInput, { target: { value: '8' } });

    const submitBtn = screen.getByRole('button', { name: /Simpan Stok Awal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        periodMonth: '2026-08',
        entries: [
          {
            rawMaterialId: '11111111-1111-4111-8111-111111111111',
            quantity: '12',
            unitPrice: undefined,
          },
          {
            rawMaterialId: '22222222-2222-4222-8222-222222222222',
            quantity: '8',
            unitPrice: '20000',
          },
        ],
      }),
      expect.anything(),
    );
  });

  it('shows validation errors when invalid non-numeric quantity is submitted', async () => {
    const handleSubmit = vi.fn();

    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={mockRows}
        onSubmit={handleSubmit}
      />,
    );

    const kopiQtyInput = screen.getByLabelText('Stok fisik Biji Kopi Arabika');
    fireEvent.change(kopiQtyInput, { target: { value: 'invalid-abc' } });

    const submitBtn = screen.getByRole('button', { name: /Simpan Stok Awal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Periksa kembali input jumlah dan harga satuan/i),
      ).toBeInTheDocument();
    });
  });
});
