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
      purchaseUnit: 'kg',
      conversionFactor: '1.0000',
      carryForwardQuantity: '10.0000',
      declaredQuantity: '12.0000',
      declaredUnitPrice: null,
      requiresUnitPrice: false, // Purchase already exists
      currentUnitCost: '150000.000000',
    },
    {
      rawMaterialId: '22222222-2222-4222-8222-222222222222',
      name: 'Susu UHT Fresh',
      unit: 'liter',
      purchaseUnit: 'liter',
      conversionFactor: '1.0000',
      carryForwardQuantity: '5.0000',
      declaredQuantity: null,
      declaredUnitPrice: null,
      requiresUnitPrice: true, // No purchase in period -> requires manual unitPrice
      currentUnitCost: '20000.000000',
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
      screen.getByText(/Belum ada pembelian pada periode ini/),
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
    // Prefilled from currentUnitCost, which the API serializes at 6dp since
    // ADR-024 — the field must read "20.000", never "20.000,000000".
    expect(susuPriceInput).toHaveValue('20.000');
  });

  it('shows a fractional unit cost in full but drops an all-zero decimal part', () => {
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={[
          { ...mockRows[1]!, currentUnitCost: '3333.333333' },
          {
            ...mockRows[1]!,
            rawMaterialId: '33333333-3333-4333-8333-333333333333',
            name: 'Gula Pasir',
            currentUnitCost: '10000.000000',
          },
        ]}
        onSubmit={vi.fn()}
      />,
    );

    // A rate that genuinely does not divide is shown as it is — the six
    // decimals are the point of ADR-024, so hiding them would lie.
    expect(screen.getByLabelText('Harga satuan Susu UHT Fresh')).toHaveValue(
      '3.333,333333',
    );
    // Trailing zeros carry no information and only confuse the operator.
    expect(screen.getByLabelText('Harga satuan Gula Pasir')).toHaveValue(
      '10.000',
    );
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

  it('prefills a four-digit count as a plain number, not the id-ID "5.000"', async () => {
    // The regression that made this test exist: formatQuantity renders id-ID,
    // where the thousands separator is a dot. Seeding the field with it meant
    // "5000.0000" showed as "5.000" and was submitted verbatim, and the API
    // read it back as FIVE — a -4695 correction that the negative-stock guard
    // rejected. Every earlier fixture used quantities under 1000, so nothing
    // caught it.
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={[
          { ...mockRows[0]!, declaredQuantity: '5000.0000' },
          { ...mockRows[1]!, declaredQuantity: '0.5000' },
        ]}
        onSubmit={handleSubmit}
      />,
    );

    expect(screen.getByLabelText('Stok fisik Biji Kopi Arabika')).toHaveValue(
      '5000',
    );
    expect(screen.getByLabelText('Stok fisik Susu UHT Fresh')).toHaveValue(
      '0.5',
    );

    fireEvent.click(screen.getByRole('button', { name: /Simpan Stok Awal/i }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));

    const [payload] = handleSubmit.mock.calls[0] as [
      { entries: { quantity: string }[] },
    ];
    expect(payload.entries.map((e) => e.quantity)).toEqual(['5000', '0.5']);
  });

  it('never offers a negative carry-forward as the suggested physical count', () => {
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={[
          {
            ...mockRows[1]!,
            declaredQuantity: null,
            carryForwardQuantity: '-300.0000',
          },
        ]}
        onSubmit={vi.fn()}
      />,
    );

    // The column still reports the ledger honestly...
    expect(screen.getByText('-300 liter')).toBeInTheDocument();
    // ...but a count of minus three hundred is not a thing anyone can weigh.
    expect(screen.getByLabelText('Stok fisik Susu UHT Fresh')).toHaveAttribute(
      'placeholder',
      '0',
    );
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
            // Untouched by the operator, so the 6dp prefill is submitted
            // verbatim — UnitCostString accepts it and it is the same number.
            unitPrice: '20000.000000',
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

  it('counts in the STOCK unit and shows the purchase conversion only as a hint', () => {
    // ADR-024: the persisted value is always the stock quantity. The hint helps
    // whoever is counting convert in their head; it is never a second input.
    const converting: OpeningStockWorksheetRow = {
      ...mockRows[0],
      unit: 'gram',
      purchaseUnit: 'kg',
      conversionFactor: '1000.0000',
    };

    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={[converting]}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId(`opname-conversion-${converting.rawMaterialId}`)
        .textContent,
    ).toContain('1 kg =');
    expect(
      screen.getByText(/Stok Fisik Awal \(satuan stok\)/),
    ).toBeInTheDocument();
  });

  it('omits the conversion hint when the purchase unit IS the stock unit', () => {
    render(
      <OpeningStockWorksheetTable
        periodMonth="2026-08"
        rows={mockRows}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId(`opname-conversion-${mockRows[0].rawMaterialId}`),
    ).toBeNull();
  });
});
