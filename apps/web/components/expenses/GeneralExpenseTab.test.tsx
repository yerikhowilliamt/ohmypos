import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  LedgerEntryResponse,
  PaginationMeta,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { GeneralExpenseTab } from './GeneralExpenseTab';
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

const mockEntries: LedgerEntryResponse[] = [
  {
    id: '11111111-2222-4333-8444-555555555555',
    accountId: 'aaaaaaaa-1111-4111-8111-111111111111',
    categoryId: 'bbbbbbbb-1111-4111-8111-111111111111',
    branchId: 'cccccccc-1111-4111-8111-111111111111',
    entryDate: '2026-08-20T00:00:00.000Z',
    amount: '250000.00',
    type: 'OUTFLOW',
    sourceType: 'MANUAL',
    sourceId: null,
    note: 'Listrik Agustus',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  },
  {
    id: '99999999-2222-4333-8444-555555555555',
    accountId: 'aaaaaaaa-1111-4111-8111-111111111111',
    categoryId: 'bbbbbbbb-1111-4111-8111-111111111111',
    branchId: 'cccccccc-1111-4111-8111-111111111111',
    entryDate: '2026-08-18T00:00:00.000Z',
    amount: '90000.00',
    type: 'OUTFLOW',
    sourceType: 'PURCHASE',
    sourceId: '22222222-3333-4444-8555-666666666666',
    note: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
];

/**
 * `meta` is overridable so a test can pretend the ledger spans several pages
 * without inventing 60 fixtures — same device as `PayablesTab.test.tsx`.
 */
function mockLedger(metaOverride?: Partial<PaginationMeta>) {
  vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/ledger-entries')) {
      // Echo the requested page/limit back, the way the real endpoint does —
      // the page-size control reads its value from `meta.limit`.
      const query = new URLSearchParams(path.split('?')[1] ?? '');
      return Promise.resolve({
        data: mockEntries,
        meta: {
          total: 2,
          totalPages: 1,
          page: Number(query.get('page') ?? 1),
          limit: Number(query.get('limit') ?? 10),
          ...metaOverride,
        },
      });
    }
    return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
  });
}

function lastLedgerPath(): string {
  const calls = vi
    .mocked(apiModule.apiFetch)
    .mock.calls.map((c) => c[0] as string)
    .filter((path) => path.startsWith('/ledger-entries?'));
  return calls[calls.length - 1] ?? '';
}

describe('GeneralExpenseTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests one page with the default sort on first render', async () => {
    mockLedger();
    renderWithClient(<GeneralExpenseTab />);

    await screen.findByText('Listrik Agustus');
    // DEBT-055: the old call was a bare `limit=50` with no page controls.
    expect(lastLedgerPath()).toContain('page=1');
    expect(lastLedgerPath()).toContain('limit=10');
    expect(lastLedgerPath()).toContain('sortBy=entryDate');
    expect(lastLedgerPath()).toContain('sortOrder=desc');
    expect(lastLedgerPath()).toContain('type=OUTFLOW');
  });

  it('renders the pagination footer, which the screen previously had none of', async () => {
    mockLedger({ total: 340, totalPages: 34 });
    renderWithClient(<GeneralExpenseTab />);

    await screen.findByText('Listrik Agustus');
    // This is the whole point of DEBT-055: the row count is on screen, so a
    // table that stops at 10 rows says so instead of looking complete.
    const footer = screen.getByTestId('data-table-pagination');
    expect(footer.textContent).toContain('Menampilkan');
    expect(footer.textContent).toContain('1\u20131');
    expect(footer.textContent).toContain('340');
    expect(footer.textContent).toContain('pengeluaran');
  });

  it('pages forward and resets to page 1 when the sort changes', async () => {
    mockLedger({ total: 340, totalPages: 34 });
    renderWithClient(<GeneralExpenseTab />);
    await screen.findByText('Listrik Agustus');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => expect(lastLedgerPath()).toContain('page=2'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    await waitFor(() => expect(lastLedgerPath()).toContain('sortBy=amount'));
    // Page 2 of the old ordering is not page 2 of the new one.
    expect(lastLedgerPath()).toContain('page=1');
  });

  it('sends the direction to the API on the second click of a sort header', async () => {
    mockLedger();
    renderWithClient(<GeneralExpenseTab />);
    await screen.findByText('Listrik Agustus');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    await waitFor(() => expect(lastLedgerPath()).toContain('sortOrder=asc'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    await waitFor(() => expect(lastLedgerPath()).toContain('sortOrder=desc'));
    expect(lastLedgerPath()).toContain('sortBy=amount');
  });

  it('offers no sort header for the columns the backend cannot order by', async () => {
    mockLedger();
    renderWithClient(<GeneralExpenseTab />);
    await screen.findByText('Listrik Agustus');

    // `LedgerEntrySortBySchema` has no `note`/`sourceType` key. A sortable
    // header there would reorder the visible 10 rows while looking like it
    // ordered the whole ledger.
    expect(
      screen.queryByRole('button', { name: 'Urutkan kolom Catatan' }),
    ).toBe(null);
    expect(screen.queryByRole('button', { name: 'Urutkan kolom Sumber' })).toBe(
      null,
    );
    expect(
      screen.getByRole('button', { name: 'Urutkan kolom Tanggal' }),
    ).toBeDefined();
  });

  it('changing the page size re-requests from page 1', async () => {
    mockLedger({ total: 340, totalPages: 34 });
    renderWithClient(<GeneralExpenseTab />);
    await screen.findByText('Listrik Agustus');

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => expect(lastLedgerPath()).toContain('page=2'));

    fireEvent.pointerDown(
      screen.getByRole('combobox', { name: /baris per halaman/i }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    );
    fireEvent.click(await screen.findByRole('option', { name: '50' }));

    await waitFor(() => expect(lastLedgerPath()).toContain('limit=50'));
    expect(lastLedgerPath()).toContain('page=1');
  });

  it('the Export loop reuses the on-screen query, changing only page and limit', async () => {
    mockLedger({ total: 340, totalPages: 34 });
    renderWithClient(<GeneralExpenseTab />);
    await screen.findByText('Listrik Agustus');

    fireEvent.click(
      screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
    );
    await waitFor(() => expect(lastLedgerPath()).toContain('sortBy=amount'));

    const onScreen = new URLSearchParams(lastLedgerPath().split('?')[1]);
    onScreen.delete('page');
    onScreen.delete('limit');

    fireEvent.click(screen.getByRole('button', { name: /^Export/ }));
    await waitFor(() => expect(lastLedgerPath()).toContain(`limit=100`));

    // Rebuilding the export's filters independently is how the file quietly
    // ends up holding a different set from the screen (TASK-073's trap).
    const exported = new URLSearchParams(lastLedgerPath().split('?')[1]);
    exported.delete('page');
    exported.delete('limit');
    expect(exported.toString()).toBe(onScreen.toString());
  });
});
