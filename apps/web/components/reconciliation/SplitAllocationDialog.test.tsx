import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  BankTransactionResponse,
  LedgerEntryResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { SplitAllocationDialog } from './SplitAllocationDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiFetch: vi.fn() };
});

const TXN_ID = '11111111-2222-4333-8444-555555555555';
const ENTRY_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ENTRY_B = 'bbbbbbbb-2222-4222-8222-222222222222';

const transaction: BankTransactionResponse = {
  id: TXN_ID,
  accountId: 'cccccccc-3333-4333-8333-333333333333',
  txnDate: '2026-02-01T00:00:00.000Z',
  amount: '1500000.00',
  type: 'INFLOW',
  description: 'Setoran tunai cabang',
  externalRef: null,
  status: 'UNRESOLVED',
  importedAt: '2026-02-01T00:00:00.000Z',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

function entry(id: string, amount: string, note: string): LedgerEntryResponse {
  return {
    id,
    accountId: transaction.accountId,
    categoryId: 'dddddddd-4444-4444-8444-444444444444',
    branchId: 'eeeeeeee-5555-4555-8555-555555555555',
    entryDate: '2026-02-01T00:00:00.000Z',
    amount,
    type: 'INFLOW',
    sourceType: 'SALE',
    sourceId: null,
    note,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };
}

const entries = [
  entry(ENTRY_A, '1200000.00', 'Penjualan QRIS'),
  entry(ENTRY_B, '300000.00', 'Penjualan transfer'),
];

/** `allocationsByCall` lets a test change what the server returns between calls. */
function mockApi(options: {
  allocationsByCall: Array<Array<Record<string, unknown>>>;
  onCreate?: (body: unknown) => Promise<unknown>;
}) {
  let allocationCall = 0;

  vi.mocked(apiModule.apiFetch).mockImplementation(
    (path: string, init?: RequestInit) => {
      if (path.startsWith('/ledger-entries')) {
        return Promise.resolve({
          data: entries,
          meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
        });
      }
      if (path === `/allocations/transaction/${TXN_ID}`) {
        const index = Math.min(
          allocationCall,
          options.allocationsByCall.length - 1,
        );
        allocationCall += 1;
        return Promise.resolve(options.allocationsByCall[index]);
      }
      if (path === '/allocations' && init?.method === 'POST') {
        const body: unknown = JSON.parse(String(init.body));
        if (options.onCreate) return options.onCreate(body);
        return Promise.resolve([{ id: 'new', bankTransactionId: TXN_ID }]);
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    },
  );
}

function renderDialog() {
  return renderWithClient(
    <SplitAllocationDialog
      open
      onOpenChange={vi.fn()}
      transaction={transaction}
    />,
  );
}

/**
 * Opens the row's ledger-entry Select and picks the option whose note matches
 * `entryId`. `findByRole` retries until the option renders, which also covers
 * the case where `useLedgerEntryCandidates` hasn't resolved yet when the row
 * first appears — a real operator can't pick an option that isn't on screen
 * either, so this is not a test-only accommodation.
 */
async function selectLedgerEntry(rowIndex: number, entryId: string) {
  const noteMatch =
    entryId === ENTRY_A ? /penjualan qris/i : /penjualan transfer/i;
  fireEvent.click(screen.getByTestId(`split-entry-${rowIndex}`));
  fireEvent.click(await screen.findByRole('option', { name: noteMatch }));
}

describe('SplitAllocationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submit and warns before an over-allocated split reaches the backend', async () => {
    mockApi({ allocationsByCall: [[]] });
    renderDialog();

    await screen.findByTestId('split-entry-0');
    await selectLedgerEntry(0, ENTRY_A);
    expect(screen.getByTestId('split-entry-0')).toHaveTextContent(
      /penjualan qris/i,
    );
    // 1.500.001 against a 1.500.000 transaction — one rupiah over.
    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '1500001' },
    });

    expect(await screen.findByTestId('split-over-allocated')).toBeDefined();
    expect(screen.getByTestId('split-remaining')).toHaveTextContent(/-/);

    const submit = screen.getByRole('button', { name: /simpan alokasi/i });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/allocations',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('allows a split totalling exactly the transaction amount', async () => {
    mockApi({ allocationsByCall: [[]] });
    renderDialog();

    await screen.findByTestId('split-entry-0');
    await selectLedgerEntry(0, ENTRY_A);
    expect(screen.getByTestId('split-entry-0')).toHaveTextContent(
      /penjualan qris/i,
    );
    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '1200000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah baris/i }));
    await selectLedgerEntry(1, ENTRY_B);
    fireEvent.change(screen.getByTestId('split-amount-1'), {
      target: { value: '300000' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('split-remaining')).toHaveTextContent(/Rp\s*0/);
    });
    expect(screen.queryByTestId('split-over-allocated')).toBeNull();

    const submit = screen.getByRole('button', { name: /simpan alokasi/i });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/allocations',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.find(([path]) => path === '/allocations');
    const payload = JSON.parse(String(call?.[1]?.body)) as {
      allocations: Array<{ ledgerEntryId: string; amountPortion: string }>;
    };
    expect(payload.allocations).toHaveLength(2);
    expect(payload.allocations[0]).toMatchObject({
      ledgerEntryId: ENTRY_A,
      amountPortion: '1200000',
    });
    expect(payload.allocations[1]).toMatchObject({
      ledgerEntryId: ENTRY_B,
      amountPortion: '300000',
    });
  });

  it('completes a split across two submissions, counting the committed part', async () => {
    // Call 1: nothing saved. Calls 2+: the first 1.200.000 is now ACTIVE.
    mockApi({
      allocationsByCall: [
        [],
        [
          {
            id: 'alloc-1',
            bankTransactionId: TXN_ID,
            ledgerEntryId: ENTRY_A,
            amountPortion: '1200000.00',
            status: 'ACTIVE',
            revokedAt: null,
            idempotencyKey: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            ledgerEntry: entries[0],
          },
        ],
      ],
    });
    renderDialog();

    await screen.findByTestId('split-entry-0');
    await selectLedgerEntry(0, ENTRY_A);
    expect(screen.getByTestId('split-entry-0')).toHaveTextContent(
      /penjualan qris/i,
    );
    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '1200000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /simpan alokasi/i }));

    // After the refetch, "Teralokasi" reflects the committed 1.200.000.
    await waitFor(() => {
      expect(screen.getByTestId('split-allocated')).toHaveTextContent(
        /1\.200\.000/,
      );
    });
    expect(await screen.findByTestId('saved-allocations')).toBeDefined();

    // Second submission: only 300.000 may still be allocated.
    await selectLedgerEntry(0, ENTRY_B);
    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '300001' },
    });
    expect(await screen.findByTestId('split-over-allocated')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /simpan alokasi/i }),
    ).toBeDisabled();

    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '300000' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('split-remaining')).toHaveTextContent(/Rp\s*0/);
    });
    expect(
      screen.getByRole('button', { name: /simpan alokasi/i }),
    ).not.toBeDisabled();
  });

  it('blocks two draft lines pointing at the same ledger entry', async () => {
    mockApi({ allocationsByCall: [[]] });
    renderDialog();

    await screen.findByTestId('split-entry-0');
    await selectLedgerEntry(0, ENTRY_A);
    expect(screen.getByTestId('split-entry-0')).toHaveTextContent(
      /penjualan qris/i,
    );
    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '100000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah baris/i }));
    await selectLedgerEntry(1, ENTRY_A);
    fireEvent.change(screen.getByTestId('split-amount-1'), {
      target: { value: '200000' },
    });

    expect(await screen.findByTestId('split-line-error-1')).toHaveTextContent(
      /sudah dipakai/i,
    );
    expect(
      screen.getByRole('button', { name: /simpan alokasi/i }),
    ).toBeDisabled();
  });

  it('surfaces the backend allocation-sum rejection verbatim', async () => {
    // The client guard is not the authority — a concurrent allocation elsewhere
    // can still make this dialog's base stale, and the 400 must be readable.
    mockApi({
      allocationsByCall: [[]],
      onCreate: () =>
        Promise.reject(
          new apiModule.ApiError(
            'Total allocation (1500001.00) exceeds transaction amount (1500000.00) for transaction ' +
              TXN_ID,
            400,
          ),
        ),
    });
    renderDialog();

    await screen.findByTestId('split-entry-0');
    await selectLedgerEntry(0, ENTRY_A);
    expect(screen.getByTestId('split-entry-0')).toHaveTextContent(
      /penjualan qris/i,
    );
    fireEvent.change(screen.getByTestId('split-amount-0'), {
      target: { value: '1200000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /simpan alokasi/i }));

    expect(await screen.findByTestId('split-server-error')).toHaveTextContent(
      /exceeds transaction amount/i,
    );
  });

  /**
   * Regression guard (TASK-068). `useLedgerEntryCandidates` fetched
   * `limit=100&page=1` while `/ledger-entries` orders by entryDate DESC, so a
   * window holding more than 100 entries silently dropped its OLDEST ones —
   * exactly where the nearest-date match sits when the anchor transaction is
   * early in its own ±30-day window. The dialog's nearest-date sort and its
   * text filter both run over whatever this hook returns, so a short list makes
   * the operator conclude the entry does not exist.
   */
  describe('ledger-entry candidates span every page', () => {
    const ENTRY_C = 'cccccccc-9999-4999-8999-999999999999';

    it('offers an entry that only exists on the second page', async () => {
      vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
        if (path.startsWith('/ledger-entries')) {
          const page = new URLSearchParams(path.split('?')[1] ?? '').get(
            'page',
          );
          return Promise.resolve({
            data:
              page === '2'
                ? [entry(ENTRY_C, '500000.00', 'Penjualan tunai lama')]
                : entries,
            meta: {
              total: 3,
              page: Number(page ?? 1),
              limit: 100,
              totalPages: 2,
            },
          });
        }
        if (path === `/allocations/transaction/${TXN_ID}`) {
          return Promise.resolve([]);
        }
        return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
      });

      renderDialog();
      await screen.findByTestId('split-entry-0');

      fireEvent.click(screen.getByTestId('split-entry-0'));
      expect(
        await screen.findByRole('option', { name: /penjualan tunai lama/i }),
      ).toBeDefined();
    });

    it('stops paging at totalPages rather than looping', async () => {
      vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
        if (path.startsWith('/ledger-entries')) {
          const page = new URLSearchParams(path.split('?')[1] ?? '').get(
            'page',
          );
          return Promise.resolve({
            data: entries,
            meta: {
              total: 4,
              page: Number(page ?? 1),
              limit: 100,
              totalPages: 2,
            },
          });
        }
        if (path === `/allocations/transaction/${TXN_ID}`) {
          return Promise.resolve([]);
        }
        return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
      });

      renderDialog();
      await screen.findByTestId('split-entry-0');

      await waitFor(() => {
        const calls = vi
          .mocked(apiModule.apiFetch)
          .mock.calls.filter(([path]) =>
            String(path).startsWith('/ledger-entries'),
          );
        expect(calls).toHaveLength(2);
      });
    });
  });
});
