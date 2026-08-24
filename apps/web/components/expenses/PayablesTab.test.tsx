import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  AccountResponse,
  PayableResponse,
  PayableSupplierSummary,
  PaginationMeta,
  SupplierResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PayablesTab } from './PayablesTab';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const mockAccounts: AccountResponse[] = [
  {
    id: 'cccccccc-1111-4111-8111-111111111111',
    name: 'Kas Tunai',
    type: 'CASH',
    openingBalance: '0.00',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockPayables: {
  data: PayableResponse[];
  meta: PaginationMeta;
} = {
  data: [
    {
      id: '11111111-2222-4333-8444-555555555555',
      supplierPurchaseId: '22222222-3333-4444-8555-666666666666',
      supplierId: '33333333-4444-4555-8666-777777777777',
      supplierName: 'CV Sumber Rasa',
      originalAmount: '500000.00',
      remainingBalance: '300000.00',
      settledAmount: '200000.00',
      status: 'PARTIALLY_SETTLED',
      settlements: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
    {
      id: '99999999-2222-4333-8444-555555555555',
      supplierPurchaseId: '88888888-3333-4444-8555-666666666666',
      supplierId: '77777777-4444-4555-8666-777777777777',
      supplierName: 'PT Kopi Nusantara',
      originalAmount: '1000000.00',
      remainingBalance: '0.00',
      settledAmount: '1000000.00',
      status: 'SETTLED',
      settlements: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
  ],
  meta: {
    page: 1,
    limit: 50,
    total: 2,
    totalPages: 1,
  },
};

const mockSummary: PayableSupplierSummary[] = [
  {
    supplierId: '33333333-4444-4555-8666-777777777777',
    supplierName: 'CV Sumber Rasa',
    openPayableCount: 1,
    totalOutstanding: '300000.00',
  },
];

const mockSuppliers: { data: SupplierResponse[]; meta: PaginationMeta } = {
  data: [
    {
      id: '33333333-4444-4555-8666-777777777777',
      name: 'CV Sumber Rasa',
      contact: null,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
  ],
  meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

/**
 * `meta` is overridable so a test can pretend the result spans several pages
 * without inventing 60 payable fixtures.
 */
function mockReferenceData(metaOverride?: Partial<PaginationMeta>) {
  vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/payables/summary'))
      return Promise.resolve(mockSummary);
    if (path.startsWith('/payables')) {
      // Echo the requested limit back in `meta`, the way the real endpoint
      // does — the page-size control reads its value from `meta.limit`, so a
      // fixture that ignored the request would make it un-testable.
      const query = new URLSearchParams(path.split('?')[1] ?? '');
      return Promise.resolve({
        ...mockPayables,
        meta: {
          ...mockPayables.meta,
          limit: Number(query.get('limit') ?? mockPayables.meta.limit),
          page: Number(query.get('page') ?? 1),
          ...metaOverride,
        },
      });
    }
    if (path.startsWith('/suppliers')) return Promise.resolve(mockSuppliers);
    if (path === '/accounts') return Promise.resolve(mockAccounts);
    return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
  });
}

/** The most recent `/payables?...` request path, which is what every
 * filter/sort/page assertion below is really about. */
function lastPayablesPath(): string {
  const calls = vi
    .mocked(apiModule.apiFetch)
    .mock.calls.map((c) => c[0] as string)
    .filter((path) => path.startsWith('/payables?'));
  return calls[calls.length - 1] ?? '';
}

describe('PayablesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders summary cards and payables list with status badges', async () => {
    mockReferenceData();

    renderWithClient(<PayablesTab />);

    // Wait for payables and summary queries to load
    const supplierElements = await screen.findAllByText('CV Sumber Rasa');
    expect(supplierElements.length).toBeGreaterThan(0);

    // Check summary card total
    expect(screen.getByText('Total Utang Terbuka')).toBeDefined();
    expect(screen.getByText(/1 pemasok/i)).toBeDefined();

    // Check payables rows
    expect(screen.getByText('PT Kopi Nusantara')).toBeDefined();

    // Check status badges
    expect(screen.getByText('Sebagian')).toBeDefined();
    expect(screen.getByText('Lunas')).toBeDefined();

    // Check amounts rendered (using regex for whitespace flexibility)
    expect(screen.getAllByText(/300\.000/).length).toBeGreaterThan(0);
  });

  it('opens settlement dialog when clicking Bayar on unsettled payable', async () => {
    mockReferenceData();

    renderWithClient(<PayablesTab />);

    const supplierElements = await screen.findAllByText('CV Sumber Rasa');
    expect(supplierElements.length).toBeGreaterThan(0);

    const payButtons = screen.getAllByRole('button', { name: /^bayar$/i });
    expect(payButtons).toHaveLength(2);

    // First button (CV Sumber Rasa, PARTIALLY_SETTLED) is enabled
    expect(payButtons[0]).not.toBeDisabled();
    // Second button (PT Kopi Nusantara, SETTLED) is disabled
    expect(payButtons[1]).toBeDisabled();

    fireEvent.click(payButtons[0]);

    // Dialog opens with title and supplier name
    expect(
      await screen.findByRole('heading', {
        name: /pembayaran utang|bayar utang/i,
      }),
    ).toBeDefined();
    expect(screen.getAllByText('CV Sumber Rasa').length).toBeGreaterThan(0);
  });

  it('requests page 1 with the default sort on first render', async () => {
    mockReferenceData();
    renderWithClient(<PayablesTab />);

    await screen.findAllByText('CV Sumber Rasa');
    expect(lastPayablesPath()).toContain('page=1');
    expect(lastPayablesPath()).toContain('limit=10');
    expect(lastPayablesPath()).toContain('sortBy=createdAt');
    expect(lastPayablesPath()).toContain('sortOrder=desc');
  });

  it('sends the column and direction to the API when a sort header is clicked', async () => {
    mockReferenceData();
    renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Sisa Utang' }),
    );
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('sortBy=remainingBalance');
    });
    expect(lastPayablesPath()).toContain('sortOrder=asc');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Sisa Utang' }),
    );
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('sortOrder=desc');
    });
    expect(lastPayablesPath()).toContain('sortBy=remainingBalance');
  });

  it('sorts by supplierName, which the backend resolves through the relation', async () => {
    mockReferenceData();
    renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Pemasok' }),
    );
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('sortBy=supplierName');
    });
  });

  it('pages forward and resets to page 1 when the sort changes', async () => {
    mockReferenceData({ total: 60, page: 1, totalPages: 3 });
    renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('page=2');
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah Awal' }),
    );
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('sortBy=originalAmount');
    });
    expect(lastPayablesPath()).toContain('page=1');
  });

  it('still refetches a filtered/paged list when the payables cache is invalidated', async () => {
    mockReferenceData();
    const { queryClient } = renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    const before = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.filter((c) =>
        (c[0] as string).startsWith('/payables?'),
      ).length;

    // This is exactly what useSettlePayable does. The query key gained a params
    // segment, so this only works because ['payables'] is still its prefix.
    await queryClient.invalidateQueries({ queryKey: ['payables'] });

    await waitFor(() => {
      const after = vi
        .mocked(apiModule.apiFetch)
        .mock.calls.filter((c) =>
          (c[0] as string).startsWith('/payables?'),
        ).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('sends the chosen status filter to the API and resets the page', async () => {
    mockReferenceData({ total: 60, page: 1, totalPages: 3 });
    renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('page=2');
    });

    // Radix Select opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByRole('combobox', { name: /status/i }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Lunas' }));

    await waitFor(() => {
      expect(lastPayablesPath()).toContain('status=SETTLED');
    });
    expect(lastPayablesPath()).toContain('page=1');
  });

  it('sends the chosen supplier filter to the API', async () => {
    mockReferenceData();
    renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    fireEvent.pointerDown(screen.getByRole('combobox', { name: /pemasok/i }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(
      await screen.findByRole('option', { name: 'CV Sumber Rasa' }),
    );

    await waitFor(() => {
      expect(lastPayablesPath()).toContain(
        'supplierId=33333333-4444-4555-8666-777777777777',
      );
    });
  });

  it('changing the page size re-requests from page 1', async () => {
    mockReferenceData({ total: 60, totalPages: 6 });
    renderWithClient(<PayablesTab />);
    await screen.findAllByText('CV Sumber Rasa');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => {
      expect(lastPayablesPath()).toContain('page=2');
    });

    fireEvent.pointerDown(screen.getByTestId('data-table-page-size'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: '50' }));

    await waitFor(() => {
      expect(lastPayablesPath()).toContain('limit=50');
    });
    // Page 2 of a 10-row paging is not page 2 of a 50-row one.
    expect(lastPayablesPath()).toContain('page=1');
  });
});
