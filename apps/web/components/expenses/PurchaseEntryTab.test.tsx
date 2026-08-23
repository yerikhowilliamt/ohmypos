import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  PaginationMeta,
  SupplierPurchaseResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PurchaseEntryTab } from './PurchaseEntryTab';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>();
  return {
    ...actual,
    exportRowsToXlsx: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const mockPurchases: SupplierPurchaseResponse[] = [
  {
    id: '11111111-2222-4333-8444-555555555555',
    supplierId: '33333333-4444-4555-8666-777777777777',
    supplierName: 'CV Sumber Rasa',
    branchId: null,
    isCentral: true,
    purchaseDate: '2026-08-20T00:00:00.000Z',
    paymentStatus: 'PAID',
    totalAmount: '450000.00',
    ledgerEntryId: 'aaaaaaaa-1111-4111-8111-111111111111',
    payableId: null,
    note: null,
    items: [],
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  },
  {
    id: '99999999-2222-4333-8444-555555555555',
    supplierId: '77777777-4444-4555-8666-777777777777',
    supplierName: 'PT Kopi Nusantara',
    branchId: null,
    isCentral: true,
    purchaseDate: '2026-08-18T00:00:00.000Z',
    paymentStatus: 'UNPAID',
    totalAmount: '120000.00',
    ledgerEntryId: null,
    payableId: 'bbbbbbbb-1111-4111-8111-111111111111',
    note: null,
    items: [],
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
];

/** See `PayablesTab.test.tsx` — `meta` is overridable so a test can pretend the
 * result spans several pages without inventing 60 fixtures. */
function mockPurchaseList(metaOverride?: Partial<PaginationMeta>) {
  vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/supplier-purchases')) {
      const query = new URLSearchParams(path.split('?')[1] ?? '');
      return Promise.resolve({
        data: mockPurchases,
        meta: {
          total: 2,
          totalPages: 1,
          page: Number(query.get('page') ?? 1),
          limit: Number(query.get('limit') ?? 10),
          ...metaOverride,
        },
      });
    }
    if (path.startsWith('/branches')) return Promise.resolve([]);
    return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
  });
}

function lastPurchasesPath(): string {
  const calls = vi
    .mocked(apiModule.apiFetch)
    .mock.calls.map((c) => c[0] as string)
    .filter((path) => path.startsWith('/supplier-purchases?'));
  return calls[calls.length - 1] ?? '';
}

describe('PurchaseEntryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests one page with the default sort on first render', async () => {
    mockPurchaseList();
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);

    await screen.findByText('CV Sumber Rasa');
    // DEBT-055: the old call was a bare `limit=50` with no page controls.
    expect(lastPurchasesPath()).toContain('page=1');
    expect(lastPurchasesPath()).toContain('limit=10');
    expect(lastPurchasesPath()).toContain('sortBy=purchaseDate');
    expect(lastPurchasesPath()).toContain('sortOrder=desc');
  });

  it('renders the pagination footer, which the screen previously had none of', async () => {
    mockPurchaseList({ total: 340, totalPages: 34 });
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);

    await screen.findByText('CV Sumber Rasa');
    const footer = screen.getByTestId('data-table-pagination');
    expect(footer.textContent).toContain('Menampilkan');
    expect(footer.textContent).toContain('1–10');
    expect(footer.textContent).toContain('340');
    expect(footer.textContent).toContain('pembelian');
  });

  it('pages forward and resets to page 1 when the sort changes', async () => {
    mockPurchaseList({ total: 340, totalPages: 34 });
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);
    await screen.findByText('CV Sumber Rasa');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => expect(lastPurchasesPath()).toContain('page=2'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Total' }),
    );
    await waitFor(() =>
      expect(lastPurchasesPath()).toContain('sortBy=totalAmount'),
    );
    expect(lastPurchasesPath()).toContain('page=1');
  });

  it('sends the direction to the API on the second click of a sort header', async () => {
    mockPurchaseList();
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);
    await screen.findByText('CV Sumber Rasa');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Total' }),
    );
    await waitFor(() => expect(lastPurchasesPath()).toContain('sortOrder=asc'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Total' }),
    );
    await waitFor(() =>
      expect(lastPurchasesPath()).toContain('sortOrder=desc'),
    );
    expect(lastPurchasesPath()).toContain('sortBy=totalAmount');
  });

  it('offers no sort header for the columns the backend cannot order by', async () => {
    mockPurchaseList();
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);
    await screen.findByText('CV Sumber Rasa');

    // `SupplierPurchaseSortBySchema` has only purchaseDate/totalAmount/createdAt.
    for (const label of ['Pemasok', 'Lokasi', 'Status']) {
      expect(
        screen.queryByRole('button', { name: `Urutkan kolom ${label}` }),
      ).toBe(null);
    }
    expect(
      screen.getByRole('button', { name: 'Urutkan kolom Tanggal' }),
    ).toBeDefined();
  });

  it('changing the page size re-requests from page 1', async () => {
    mockPurchaseList({ total: 340, totalPages: 34 });
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);
    await screen.findByText('CV Sumber Rasa');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => expect(lastPurchasesPath()).toContain('page=2'));

    fireEvent.pointerDown(
      screen.getByRole('combobox', { name: /baris per halaman/i }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    );
    fireEvent.click(await screen.findByRole('option', { name: '25' }));

    await waitFor(() => expect(lastPurchasesPath()).toContain('limit=25'));
    expect(lastPurchasesPath()).toContain('page=1');
  });

  it('the Export loop reuses the on-screen query, changing only page and limit', async () => {
    mockPurchaseList({ total: 340, totalPages: 34 });
    renderWithClient(<PurchaseEntryTab onGoToPayables={vi.fn()} />);
    await screen.findByText('CV Sumber Rasa');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Total' }),
    );
    await waitFor(() =>
      expect(lastPurchasesPath()).toContain('sortBy=totalAmount'),
    );

    const onScreen = new URLSearchParams(lastPurchasesPath().split('?')[1]);
    onScreen.delete('page');
    onScreen.delete('limit');

    fireEvent.click(screen.getByRole('button', { name: /^Export/ }));
    await waitFor(() => expect(lastPurchasesPath()).toContain('limit=100'));

    const exported = new URLSearchParams(lastPurchasesPath().split('?')[1]);
    exported.delete('page');
    exported.delete('limit');
    expect(exported.toString()).toBe(onScreen.toString());
  });
});
