import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';

interface Row {
  name: string;
  amount: number;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Nama' },
  { accessorKey: 'amount', header: 'Jumlah', meta: { align: 'right' } },
];

const data: Row[] = [
  { name: 'Es Kopi Susu', amount: 20000 },
  { name: 'Latte', amount: 25000 },
];

describe('DataTable sticky identifying column', () => {
  it('pins the first column by default', () => {
    render(<DataTable columns={columns} data={data} />);
    const first = screen.getByText('Es Kopi Susu').closest('td');
    expect(first).toHaveAttribute('data-sticky', 'true');
    expect(first?.className).toContain('sticky');
    expect(first?.className).toContain('left-0');
  });

  it('does not pin any other column', () => {
    render(<DataTable columns={columns} data={data} />);
    const second = screen.getByText('20000').closest('td');
    expect(second).not.toHaveAttribute('data-sticky');
  });

  it('pins the matching header cell', () => {
    render(<DataTable columns={columns} data={data} />);
    const head = screen.getByText('Nama').closest('th');
    expect(head).toHaveAttribute('data-sticky', 'true');
  });

  it('can be turned off', () => {
    render(
      <DataTable columns={columns} data={data} stickyFirstColumn={false} />,
    );
    expect(screen.getByText('Es Kopi Susu').closest('td')).not.toHaveAttribute(
      'data-sticky',
    );
  });
});
