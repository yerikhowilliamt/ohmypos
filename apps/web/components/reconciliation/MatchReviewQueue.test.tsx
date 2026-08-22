import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  BankTransactionResponse,
  MatchCandidate,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { MatchReviewQueue } from './MatchReviewQueue';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiFetch: vi.fn() };
});

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const ENTRY = '33333333-3333-4333-8333-333333333333';

function txn(id: string, amount: string): BankTransactionResponse {
  return {
    id,
    accountId: '44444444-4444-4444-8444-444444444444',
    txnDate: '2026-02-01T00:00:00.000Z',
    amount,
    type: 'INFLOW',
    description: `Transaksi ${id}`,
    externalRef: null,
    status: 'PENDING_REVIEW',
    importedAt: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };
}

const candidate: MatchCandidate = {
  matchType: 'AGGREGATION',
  confidence: 0.85,
  bankTransactionIds: [T1, T2],
  ledgerEntryId: ENTRY,
  matchedAmount: '150000.00',
  dateDifferenceDays: 1,
};

function mockApi(options?: {
  onReject?: (bankTransactionId: string) => Promise<unknown>;
}) {
  vi.mocked(apiModule.apiFetch).mockImplementation(
    (path: string, init?: RequestInit) => {
      if (path === '/matching/propose' && init?.method === 'POST') {
        return Promise.resolve([candidate]);
      }
      if (path.startsWith('/reconciliation/transactions')) {
        return Promise.resolve({
          data: [txn(T1, '100000.00'), txn(T2, '50000.00')],
          meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
        });
      }
      if (path === '/allocations' && init?.method === 'POST') {
        return Promise.resolve([
          { id: 'a1', bankTransactionId: T1 },
          { id: 'a2', bankTransactionId: T2 },
        ]);
      }
      if (path === '/matching/reset' && init?.method === 'POST') {
        return Promise.resolve({ resetCount: 2 });
      }
      const rejectMatch = path.match(/^\/matching\/reject\/(.+)$/);
      if (rejectMatch && init?.method === 'POST') {
        const bankTransactionId = rejectMatch[1];
        if (options?.onReject) return options.onReject(bankTransactionId);
        return Promise.resolve(txn(bankTransactionId, '100000.00'));
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    },
  );
}

describe('MatchReviewQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the matching engine on mount — propose is a mutation', async () => {
    mockApi();
    renderWithClient(<MatchReviewQueue />);

    await screen.findByRole('button', {
      name: /jalankan pencocokan otomatis/i,
    });
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/matching/propose',
      expect.anything(),
    );
  });

  it('accepting an aggregation posts one allocation per bank transaction', async () => {
    mockApi();
    renderWithClient(<MatchReviewQueue />);

    fireEvent.click(
      screen.getByRole('button', { name: /jalankan pencocokan otomatis/i }),
    );

    await screen.findByRole('button', { name: /terima/i });

    // `usePendingReviewTransactions` (the lookup handleAccept needs to resolve
    // each bank transaction's own amount) fires in the same render pass that
    // reveals "Terima", but its own fetch resolves on a separate microtask
    // chain. Retry the click until that data has actually landed and the
    // batch reaches the backend — a real operator can't click before the
    // browser has rendered the data either way, so this only removes a
    // test-harness race, not a product behaviour.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /terima/i }));
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/allocations',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.find(([path]) => path === '/allocations');
    const payload = JSON.parse(String(call?.[1]?.body)) as {
      allocations: Array<{
        bankTransactionId: string;
        ledgerEntryId: string;
        amountPortion: string;
      }>;
    };

    expect(payload.allocations).toHaveLength(2);
    expect(payload.allocations[0]).toMatchObject({
      bankTransactionId: T1,
      ledgerEntryId: ENTRY,
      amountPortion: '100000.00',
    });
    expect(payload.allocations[1]).toMatchObject({
      bankTransactionId: T2,
      amountPortion: '50000.00',
    });

    // Accepted candidates leave the queue.
    await waitFor(() => {
      expect(screen.getByTestId('match-empty')).toBeDefined();
    });
  });

  it('"Abaikan" calls the per-candidate reject endpoint for every bank transaction, once all succeed', async () => {
    mockApi();
    renderWithClient(<MatchReviewQueue />);

    fireEvent.click(
      screen.getByRole('button', { name: /jalankan pencocokan otomatis/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /abaikan/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/matching/reject/${T1}`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/matching/reject/${T2}`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(await screen.findByTestId('match-empty')).toBeDefined();
    // Abaikan is the single-candidate lever — it must never call bulk reset.
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/matching/reset',
      expect.anything(),
    );
  });

  it('leaves the candidate visible and shows an error when a reject call fails', async () => {
    mockApi({
      onReject: (bankTransactionId) =>
        bankTransactionId === T2
          ? Promise.reject(
              new apiModule.ApiError(
                `Bank transaction ${T2} is not pending review`,
                409,
              ),
            )
          : Promise.resolve(txn(bankTransactionId, '100000.00')),
    });
    renderWithClient(<MatchReviewQueue />);

    fireEvent.click(
      screen.getByRole('button', { name: /jalankan pencocokan otomatis/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /abaikan/i }));

    expect(await screen.findByTestId('match-error')).toHaveTextContent(
      /not pending review/i,
    );
    // The candidate is NOT silently dropped — it stays in the queue for retry.
    expect(screen.queryByTestId('match-empty')).toBeNull();
    expect(
      screen.getByRole('button', { name: /abaikan/i }),
    ).toBeInTheDocument();
  });

  it('reset asks for confirmation before calling /matching/reset', async () => {
    mockApi();
    renderWithClient(<MatchReviewQueue />);

    fireEvent.click(
      screen.getByRole('button', { name: /reset status pencocokan/i }),
    );
    expect(await screen.findByTestId('reset-confirm')).toBeDefined();
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/matching/reset',
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('button', { name: /ya, reset/i }));
    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/matching/reset',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('refuses to accept when a proposed transaction is missing from the lookup', async () => {
    vi.mocked(apiModule.apiFetch).mockImplementation(
      (path: string, init?: RequestInit) => {
        if (path === '/matching/propose' && init?.method === 'POST') {
          return Promise.resolve([candidate]);
        }
        if (path.startsWith('/reconciliation/transactions')) {
          // T2 is missing — a stale or truncated list.
          return Promise.resolve({
            data: [txn(T1, '100000.00')],
            meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
          });
        }
        return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
      },
    );

    renderWithClient(<MatchReviewQueue />);
    fireEvent.click(
      screen.getByRole('button', { name: /jalankan pencocokan otomatis/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /terima/i }));

    expect(await screen.findByTestId('match-error')).toHaveTextContent(
      /belum termuat/i,
    );
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/allocations',
      expect.anything(),
    );
  });

  /**
   * Regression guard for the dead end this queue used to have (TASK-068).
   *
   * `usePendingReviewTransactions` fetched `limit=100&page=1` only. It is a
   * LOOKUP, not a display list: handleAccept resolves each candidate's amounts
   * through it. A transaction past the first page therefore produced "Data
   * transaksi bank untuk usulan ini belum termuat. Jalankan ulang pencocokan
   * otomatis." — advice that can never work, because propose() only selects
   * UNRESOLVED (matching.service.ts:19) and these are already PENDING_REVIEW.
   */
  describe('pending-review lookup spans every page', () => {
    function mockPagedApi() {
      vi.mocked(apiModule.apiFetch).mockImplementation(
        (path: string, init?: RequestInit) => {
          if (path === '/matching/propose' && init?.method === 'POST') {
            return Promise.resolve([candidate]);
          }
          if (path.startsWith('/reconciliation/transactions')) {
            const page = new URLSearchParams(path.split('?')[1] ?? '').get(
              'page',
            );
            // T2 deliberately sits on page 2 — unreachable before this fix.
            return Promise.resolve({
              data:
                page === '2' ? [txn(T2, '50000.00')] : [txn(T1, '100000.00')],
              meta: {
                total: 2,
                page: Number(page ?? 1),
                limit: 100,
                totalPages: 2,
              },
            });
          }
          if (path === '/allocations' && init?.method === 'POST') {
            return Promise.resolve([
              { id: 'a1', bankTransactionId: T1 },
              { id: 'a2', bankTransactionId: T2 },
            ]);
          }
          return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
        },
      );
    }

    it('resolves a candidate whose transaction is on the second page', async () => {
      mockPagedApi();
      renderWithClient(<MatchReviewQueue />);

      fireEvent.click(
        screen.getByRole('button', { name: /jalankan pencocokan otomatis/i }),
      );
      await screen.findByRole('button', { name: /terima/i });

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /terima/i }));
        expect(apiModule.apiFetch).toHaveBeenCalledWith(
          '/allocations',
          expect.objectContaining({ method: 'POST' }),
        );
      });

      // The dead-end message must never appear.
      expect(screen.queryByTestId('match-error')).toBeNull();

      const call = vi
        .mocked(apiModule.apiFetch)
        .mock.calls.find(([path]) => path === '/allocations');
      const payload = JSON.parse(String(call?.[1]?.body)) as {
        allocations: Array<{
          bankTransactionId: string;
          amountPortion: string;
        }>;
      };
      expect(payload.allocations).toHaveLength(2);
      expect(payload.allocations[1]).toMatchObject({
        bankTransactionId: T2,
        amountPortion: '50000.00',
      });
    });

    it('stops paging at totalPages rather than looping', async () => {
      mockPagedApi();
      renderWithClient(<MatchReviewQueue />);

      fireEvent.click(
        screen.getByRole('button', { name: /jalankan pencocokan otomatis/i }),
      );
      await screen.findByRole('button', { name: /terima/i });

      await waitFor(() => {
        const lookups = vi
          .mocked(apiModule.apiFetch)
          .mock.calls.filter(([path]) =>
            String(path).startsWith('/reconciliation/transactions'),
          );
        expect(lookups).toHaveLength(2);
      });
    });
  });
});
