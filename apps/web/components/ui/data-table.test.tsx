import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ColumnDef } from '@tanstack/react-table';
// Side-effect import: test-utils installs the jsdom polyfills Radix Select
// needs (scrollIntoView, pointer capture). This file renders bare, without
// renderWithClient, so nothing else pulls them in.
import '@/test/test-utils';
import { DataTable, SortableHeader } from './data-table';
import { EXPORT_ROW_CAP, ExportTooLargeError } from '@/lib/fetchAllPages';

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

const sortableColumns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Nama' },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <SortableHeader label="Jumlah" column={column} align="right" />
    ),
    meta: { align: 'right' },
  },
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

describe('DataTable server-driven sorting and pagination', () => {
  it('keeps sorting client-side when no sorting props are given', () => {
    render(<DataTable columns={sortableColumns} data={data} />);

    // SortableHeader calls toggleSorting(sorted === 'asc'); with no prior sort
    // that is toggleSorting(false) — ascending.
    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Es Kopi Susu',
      '20000',
      'Latte',
      '25000',
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Latte',
      '25000',
      'Es Kopi Susu',
      '20000',
    ]);
  });

  it('does not reorder rows itself when sorting is controlled', () => {
    const onSortingChange = vi.fn();
    render(
      <DataTable
        columns={sortableColumns}
        data={data}
        sorting={[{ id: 'amount', desc: true }]}
        onSortingChange={onSortingChange}
      />,
    );

    // The declared state says amount-descending, but ordering belongs to the
    // server: `data` order must survive untouched.
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Es Kopi Susu',
      '20000',
      'Latte',
      '25000',
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    expect(onSortingChange).toHaveBeenCalled();
  });

  it('still renders the footer for a single page, with both chevrons disabled', () => {
    // An invisible control cannot be told apart from a missing one.
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
          onPageChange: vi.fn(),
          itemNoun: 'transaksi',
        }}
      />,
    );
    expect(screen.getByTestId('data-table-pagination')).toHaveTextContent(
      'Menampilkan 1–2 dari 2 transaksi',
    );
    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent(
      '1 / 1',
    );
    expect(
      screen.getByRole('button', { name: 'Halaman sebelumnya' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Halaman berikutnya' }),
    ).toBeDisabled();
  });

  it('renders the footer for an empty result rather than hiding it', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        pagination={{
          meta: { total: 0, page: 1, limit: 25, totalPages: 1 },
          onPageChange: vi.fn(),
          itemNoun: 'transaksi',
        }}
      />,
    );
    expect(screen.getByTestId('data-table-pagination')).toHaveTextContent(
      'Tidak ada transaksi',
    );
  });

  it('renders every numeral in the tabular mono face (DESIGN.md §5 Typography, §12.1 Data Table Rules)', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 2, limit: 25, totalPages: 3 },
          onPageChange: vi.fn(),
          itemNoun: 'transaksi',
        }}
      />,
    );
    // Gold is a 2.26:1 contrast against porcelain, so the active page is marked
    // by a gold hairline underline, never by gold text (§12).
    const indicator = screen.getByTestId('data-table-page-indicator');
    expect(indicator.className).toContain('numeric');
    expect(indicator.className).toContain('font-mono');
    expect(indicator.querySelector('.border-border-gold')).not.toBeNull();
    expect(indicator.className).not.toContain('text-brand-primary');
  });

  it('renders the footer and reports the page position for multiple pages', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 2, limit: 25, totalPages: 3 },
          onPageChange: vi.fn(),
          itemNoun: 'transaksi',
        }}
      />,
    );
    expect(screen.getByTestId('data-table-pagination')).toHaveTextContent(
      'Menampilkan 26–50 dari 60 transaksi',
    );
    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent(
      '2 / 3',
    );
  });

  it('calls onPageChange with the neighbouring page', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 2, limit: 25, totalPages: 3 },
          onPageChange,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: 'Halaman sebelumnya' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables the back chevron on the first page and the forward one on the last', () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 1, limit: 25, totalPages: 3 },
          onPageChange: vi.fn(),
        }}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Halaman sebelumnya' }),
    ).toBeDisabled();

    rerender(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 3, limit: 25, totalPages: 3 },
          onPageChange: vi.fn(),
        }}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Halaman berikutnya' }),
    ).toBeDisabled();
  });

  it('omits the rows-per-page selector unless onLimitChange is supplied', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 1, limit: 10, totalPages: 6 },
          onPageChange: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByTestId('data-table-page-size')).toBeNull();
  });

  it('places the page-size select in the toolbar row, not the footer', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 1, limit: 10, totalPages: 6 },
          onPageChange: vi.fn(),
          onLimitChange: vi.fn(),
        }}
      />,
    );
    const select = screen.getByTestId('data-table-page-size');
    expect(select).toBeInTheDocument();
    // It governs the whole table, so it belongs beside Export — not in the
    // footer, which reports the current page.
    expect(screen.getByTestId('data-table-pagination').contains(select)).toBe(
      false,
    );
  });

  it('shows the server-reported limit as the selected page size', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 1, limit: 25, totalPages: 3 },
          onPageChange: vi.fn(),
          onLimitChange: vi.fn(),
        }}
      />,
    );
    // Read from meta.limit, never from a second copy of the state, so the
    // control cannot disagree with the rows actually on screen.
    expect(screen.getByTestId('data-table-page-size')).toHaveTextContent('25');
  });

  it('reports the chosen page size', async () => {
    const onLimitChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{
          meta: { total: 60, page: 1, limit: 10, totalPages: 6 },
          onPageChange: vi.fn(),
          onLimitChange,
        }}
      />,
    );

    // Radix Select opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByTestId('data-table-page-size'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: '50' }));

    expect(onLimitChange).toHaveBeenCalledWith(50);
  });

  it('lets the search input claim its full max-width', () => {
    // jsdom has no layout, so this pins the classes rather than the pixels.
    // Without `w-full` the wrapper sized to content (~199px) and clipped
    // "Cari keterangan di halaman ini…" down to "Cari keterangan di ha…" —
    // truncating away the words that make a page-scoped search honest.
    render(
      <DataTable
        columns={columns}
        data={data}
        searchColumns={['name']}
        searchPlaceholder="Cari keterangan di halaman ini…"
      />,
    );
    const wrapper = screen
      .getByPlaceholderText('Cari keterangan di halaman ini…')
      .closest('div');
    expect(wrapper?.className).toContain('w-full');
    expect(wrapper?.className).toContain('max-w-xs');
  });
});

/**
 * `serverSearch` exists because `searchColumns` is a TanStack column filter: it
 * can only see the `data` array, which for a server-paginated table is one page.
 * The box searched 25 rows while looking like it searched the whole history
 * (DEBT-047). These cases pin the difference.
 */
describe('DataTable server-side search', () => {
  it('renders a controlled input whose value the caller owns', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        serverSearch={{ value: 'latte', onChange: vi.fn() }}
        searchPlaceholder="Cari produk…"
        searchLabel="Cari produk"
      />,
    );

    const box = screen.getByLabelText('Cari produk');
    expect(box).toHaveValue('latte');
  });

  it('reports keystrokes upward and does NOT filter the rows itself', () => {
    // The whole point: the server decides which rows come back, so a keystroke
    // must leave the page exactly as the server sent it. A client-side filter
    // here would drop rows that matched on a field with no column of its own.
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        serverSearch={{ value: '', onChange }}
        searchPlaceholder="Cari produk…"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Cari produk…'), {
      target: { value: 'latte' },
    });

    expect(onChange).toHaveBeenCalledWith('latte');
    expect(screen.getByText('Es Kopi Susu')).toBeDefined();
    expect(screen.getByText('Latte')).toBeDefined();
  });

  it('renders the toolbar without any searchColumns at all', () => {
    // A server-searched table declares no filterable columns; the old guard
    // returned null in that case and the box disappeared.
    render(
      <DataTable
        columns={columns}
        data={data}
        serverSearch={{ value: '', onChange: vi.fn() }}
        searchPlaceholder="Cari produk…"
      />,
    );

    expect(screen.getByPlaceholderText('Cari produk…')).toBeDefined();
  });

  it('ignores searchColumns entirely when serverSearch is set', () => {
    // Precedence, pinned. If a later change made the toolbar ALSO push the
    // value into the column filter, this page would be filtered twice — and
    // rows matched server-side on a field with no column (an attendance row
    // matched by email) would arrive and then vanish.
    render(
      <DataTable
        columns={columns}
        data={data}
        searchColumns={['name']}
        serverSearch={{ value: '', onChange: vi.fn() }}
        searchPlaceholder="Cari produk…"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Cari produk…'), {
      target: { value: 'latte' },
    });

    expect(screen.getByText('Es Kopi Susu')).toBeDefined();
    expect(screen.getByText('Latte')).toBeDefined();
  });

  it('says "no match" rather than "no data" when a search returned nothing', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        serverSearch={{ value: 'tidak ada', onChange: vi.fn() }}
        emptyMessage="Belum ada produk."
      />,
    );

    expect(screen.getByText(/tidak ditemukan data yang cocok/i)).toBeDefined();
    expect(screen.queryByText('Belum ada produk.')).toBeNull();
  });
});

/**
 * Export behaviour (TASK-073, DEBT-048).
 *
 * `exportRowsToXlsx` is mocked so these assert WHICH rows reach the workbook,
 * not what exceljs does with them — that is `lib/export.test.ts`'s job.
 */
const exportRowsToXlsx = vi.hoisted(() =>
  vi.fn<(filename: string, columns: unknown, rows: unknown[]) => Promise<void>>(
    async () => undefined,
  ),
);
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx,
}));

const exportColumns = [{ header: 'Nama', accessor: (row: Row) => row.name }];

const serverPagination = (total: number) => ({
  meta: { total, page: 1, limit: 25, totalPages: Math.ceil(total / 25) },
  onPageChange: vi.fn(),
});

describe('DataTable Export button', () => {
  beforeEach(() => {
    exportRowsToXlsx.mockClear();
  });

  it('exports the rows it holds when no exportAll is supplied', async () => {
    // The seven client-side tables (reports, inventory summary, top products)
    // already hold their whole result set. Adding a fetch loop there would only
    // slow them down — and on TopProductsView it would change what the file
    // MEANS, from "top 10" to "the whole catalogue".
    render(
      <DataTable
        columns={columns}
        data={data}
        exportColumns={exportColumns}
        exportFilename="x.xlsx"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await vi.waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());
    expect(exportRowsToXlsx.mock.calls[0]![2]).toEqual(data);
  });

  it('exports exportAll’s rows, not the page, when it is supplied', async () => {
    const allRows: Row[] = [
      ...data,
      { name: 'Halaman 2', amount: 1 },
      { name: 'Halaman 3', amount: 2 },
    ];
    const exportAll = vi.fn(async () => allRows);

    render(
      <DataTable
        columns={columns}
        data={data}
        exportColumns={exportColumns}
        exportFilename="x.xlsx"
        exportAll={exportAll}
        exportTotal={allRows.length}
        pagination={serverPagination(allRows.length)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await vi.waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalled());
    expect(exportAll).toHaveBeenCalledTimes(1);
    // Four rows in the file where the table only ever held two.
    expect(exportRowsToXlsx.mock.calls[0]![2]).toEqual(allRows);
  });

  it('labels the button with the SERVER total, not the rows on screen', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        exportColumns={exportColumns}
        exportFilename="x.xlsx"
        exportAll={vi.fn(async () => [])}
        exportTotal={1234}
        pagination={serverPagination(1234)}
      />,
    );

    // The count is the whole point of DEBT-048's fix: a partial export can no
    // longer happen without the number on the button disagreeing with the file.
    expect(
      screen.getByRole('button', { name: /export \(1\.234\)/i }),
    ).toBeInTheDocument();
  });

  it('refuses — rather than truncating — a set past the cap', () => {
    const exportAll = vi.fn(async () => []);
    render(
      <DataTable
        columns={columns}
        data={data}
        exportColumns={exportColumns}
        exportFilename="x.xlsx"
        exportAll={exportAll}
        exportTotal={EXPORT_ROW_CAP + 1}
        pagination={serverPagination(EXPORT_ROW_CAP + 1)}
      />,
    );

    const button = screen.getByRole('button', { name: /export/i });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(exportAll).not.toHaveBeenCalled();
    expect(exportRowsToXlsx).not.toHaveBeenCalled();
  });

  it('surfaces a failed export instead of failing silently', async () => {
    // Silence here leaves the operator believing the file is in Downloads.
    const exportAll = vi.fn(async () => {
      throw new ExportTooLargeError(9999);
    });

    render(
      <DataTable
        columns={columns}
        data={data}
        exportColumns={exportColumns}
        exportFilename="x.xlsx"
        exportAll={exportAll}
        exportTotal={2}
        pagination={serverPagination(2)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/persempit filter/i);
    expect(exportRowsToXlsx).not.toHaveBeenCalled();
    // And the button comes back — a failed export must be retryable.
    expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled();
  });
});
