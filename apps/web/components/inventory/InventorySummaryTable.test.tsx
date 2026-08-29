import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { InventorySummaryTable } from './InventorySummaryTable';
import type { InventorySummaryRow } from '@ohmypos/api-contracts';

const mockRows: InventorySummaryRow[] = [
  {
    rawMaterialId: '11111111-1111-4111-8111-111111111111',
    name: 'Biji Kopi Arabika',
    unit: 'kg',
    openingQuantity: '30.0000',
    inQuantity: '50.0000',
    outQuantity: '12.4000',
    closingQuantity: '67.6000',
    lowStockThreshold: '10.0000',
    status: 'OK',
  },
  {
    rawMaterialId: '22222222-2222-4222-8222-222222222222',
    name: 'Susu UHT Fresh',
    unit: 'liter',
    openingQuantity: '5.0000',
    inQuantity: '0.0000',
    outQuantity: '7.0000',
    closingQuantity: '-2.0000',
    lowStockThreshold: '3.0000',
    status: 'OUT',
  },
  {
    rawMaterialId: '33333333-3333-4333-8333-333333333333',
    name: 'Gula Pasir',
    unit: 'kg',
    openingQuantity: '1.0000',
    inQuantity: '0.0000',
    outQuantity: '0.0000',
    closingQuantity: '1.0000',
    lowStockThreshold: '2.0000',
    status: 'LOW',
  },
];

describe('InventorySummaryTable component', () => {
  it('renders table headers and rows with formatted quantities', () => {
    render(<InventorySummaryTable rows={mockRows} />);

    expect(screen.getByText('Bahan Baku')).toBeInTheDocument();
    expect(screen.getByText('Stok Awal')).toBeInTheDocument();
    expect(screen.getByText('Masuk')).toBeInTheDocument();
    expect(screen.getByText('Keluar')).toBeInTheDocument();
    expect(screen.getByText('Stok Akhir')).toBeInTheDocument();
    expect(screen.getByText('Batas Minimum')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    expect(screen.getByText('Biji Kopi Arabika')).toBeInTheDocument();
    expect(screen.getByText('liter')).toBeInTheDocument();
    expect(screen.getAllByText('kg').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('12,4')).toBeInTheDocument();
    expect(screen.getByText('67,6')).toBeInTheDocument();
  });

  it('applies the Flow Indicator motif to in and out columns', () => {
    const { container } = render(<InventorySummaryTable rows={mockRows} />);

    const inCells = container.querySelectorAll('td span.text-accent-inflow');
    const outCells = container.querySelectorAll('td span.text-accent-outflow');

    expect(inCells.length).toBe(mockRows.length);
    expect(outCells.length).toBe(mockRows.length);
    expect(inCells[0]?.textContent).toBe('50');
    expect(outCells[0]?.textContent).toBe('12,4');
  });

  it('renders status badges with label and semantic colors', () => {
    render(<InventorySummaryTable rows={mockRows} />);

    const okBadge = screen.getByText('Aman');
    const lowBadge = screen.getByText('Menipis');
    const outBadge = screen.getByText('Habis');

    expect(okBadge).toHaveClass('bg-status-success');
    expect(lowBadge).toHaveClass('bg-status-warning');
    expect(outBadge).toHaveClass('bg-status-danger');
  });

  it('renders zero and negative quantities cleanly', () => {
    render(<InventorySummaryTable rows={mockRows} />);

    // Susu UHT Fresh: closing -2, in 0
    expect(screen.getByText('-2')).toBeInTheDocument();
    // Gula Pasir: in 0, out 0
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the empty state when there are no rows', () => {
    render(<InventorySummaryTable rows={[]} />);

    expect(
      screen.getByText(/Belum ada data stok pada periode ini/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Belum ada bahan baku atau pergerakan stok pada periode ini.',
      ),
    ).toBeInTheDocument();
  });

  it('filters rows by material name in real time', () => {
    render(<InventorySummaryTable rows={mockRows} />);

    const search = screen.getByLabelText('Cari bahan baku');
    fireEvent.change(search, { target: { value: 'kopi' } });

    expect(screen.getByText('Biji Kopi Arabika')).toBeInTheDocument();
    expect(screen.queryByText('Susu UHT Fresh')).not.toBeInTheDocument();
    expect(screen.queryByText('Gula Pasir')).not.toBeInTheDocument();
  });

  it('sorts rows when a numeric column header is clicked', () => {
    const { container } = render(<InventorySummaryTable rows={mockRows} />);

    const sortBtn = screen.getByRole('button', {
      name: 'Urutkan kolom Stok Akhir',
    });

    // Ascending: -2 (Susu) < 1 (Gula) < 67,6 (Arabika)
    fireEvent.click(sortBtn);
    let firstRow = container.querySelector('tbody tr');
    expect(firstRow?.textContent).toContain('Susu UHT Fresh');

    // Descending: 67,6 (Arabika) largest
    fireEvent.click(sortBtn);
    firstRow = container.querySelector('tbody tr');
    expect(firstRow?.textContent).toContain('Biji Kopi Arabika');
  });

  it('shows the empty state when the filter matches nothing', () => {
    render(<InventorySummaryTable rows={mockRows} />);

    const search = screen.getByLabelText('Cari bahan baku');
    fireEvent.change(search, { target: { value: 'tidak-ada' } });

    expect(
      screen.getByText('Tidak ditemukan data yang cocok dengan filter.'),
    ).toBeInTheDocument();
  });
});
