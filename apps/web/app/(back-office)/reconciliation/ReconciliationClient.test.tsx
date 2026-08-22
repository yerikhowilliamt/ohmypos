import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { ReconciliationClient } from './ReconciliationClient';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiFetch: vi.fn() };
});

describe('ReconciliationClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an access-denied notice when the API answers 403', async () => {
    // A KASIR is redirected server-side by requireRole (ADR-011), so a 403 here
    // means the session's role changed after render. The screen reports the
    // server's refusal; it never re-implements the check.
    vi.mocked(apiModule.apiFetch).mockRejectedValue(
      new apiModule.ApiError('Forbidden resource', 403),
    );

    renderWithClient(<ReconciliationClient />);

    expect(await screen.findByTestId('reconciliation-forbidden')).toBeDefined();
    expect(screen.getByText(/akses ditolak/i)).toBeDefined();
    // The write surfaces must not be reachable in this state.
    expect(screen.queryByRole('button', { name: /impor csv/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /jalankan pencocokan otomatis/i }),
    ).toBeNull();
  });

  it('renders the reconciliation surfaces for an authorized user', async () => {
    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path === '/accounts') return Promise.resolve([]);
      if (path.startsWith('/reconciliation/summary')) {
        return Promise.resolve({
          counts: {
            UNRESOLVED: 2,
            PENDING_REVIEW: 1,
            PARTIALLY_ALLOCATED: 0,
            MATCHED: 5,
          },
          actualBankBalance: '1500000.00',
          recordedLedgerBalance: '1400000.00',
          variance: '100000.00',
        });
      }
      if (path.startsWith('/reconciliation/transactions')) {
        return Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
        });
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    });

    renderWithClient(<ReconciliationClient />);

    expect(
      await screen.findByTestId('summary-count-UNRESOLVED'),
    ).toHaveTextContent('2');
    expect(screen.getByTestId('summary-variance')).toHaveTextContent(
      /100\.000/,
    );
    expect(screen.queryByTestId('reconciliation-forbidden')).toBeNull();
  });

  /**
   * Sorting used to be a literal in `buildQuery` (`sortBy: 'txnDate'`), so the
   * three sort headers on this table reordered the visible page and nothing
   * else. These cases exist so that cannot come back (TASK-068).
   */
  describe('server-driven sorting and pagination', () => {
    function mockApi(
      metaOverride?: Partial<{
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>,
    ) {
      vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
        if (path === '/accounts') return Promise.resolve([]);
        if (path.startsWith('/reconciliation/summary')) {
          return Promise.resolve({
            counts: {
              UNRESOLVED: 1,
              PENDING_REVIEW: 0,
              PARTIALLY_ALLOCATED: 0,
              MATCHED: 0,
            },
            actualBankBalance: '0.00',
            recordedLedgerBalance: '0.00',
            variance: '0.00',
          });
        }
        if (path.startsWith('/reconciliation/transactions')) {
          return Promise.resolve({
            data: [
              {
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                accountId: 'bbbbbbbb-1111-4111-8111-111111111111',
                txnDate: '2026-08-20T00:00:00.000Z',
                amount: '250000.00',
                type: 'INFLOW',
                description: 'Setoran tunai',
                externalRef: null,
                status: 'UNRESOLVED',
                importedAt: '2026-08-21T00:00:00.000Z',
                createdAt: '2026-08-21T00:00:00.000Z',
                updatedAt: '2026-08-21T00:00:00.000Z',
              },
            ],
            meta: {
              total: 1,
              page: 1,
              limit: 50,
              totalPages: 1,
              ...metaOverride,
            },
          });
        }
        return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
      });
    }

    function lastPath(prefix: string): string {
      const calls = vi
        .mocked(apiModule.apiFetch)
        .mock.calls.map((c) => c[0] as string)
        .filter((path) => path.startsWith(prefix));
      return calls[calls.length - 1] ?? '';
    }

    function countPaths(prefix: string): number {
      return vi
        .mocked(apiModule.apiFetch)
        .mock.calls.filter((c) => (c[0] as string).startsWith(prefix)).length;
    }

    it('sends the default sort to the API on first render', async () => {
      mockApi();
      renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');

      expect(lastPath('/reconciliation/transactions')).toContain(
        'sortBy=txnDate',
      );
      expect(lastPath('/reconciliation/transactions')).toContain(
        'sortOrder=desc',
      );
    });

    it('sends the column and direction when a sort header is clicked', async () => {
      mockApi();
      renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');

      fireEvent.click(
        screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
      );
      await waitFor(() => {
        expect(lastPath('/reconciliation/transactions')).toContain(
          'sortBy=amount',
        );
      });
      expect(lastPath('/reconciliation/transactions')).toContain(
        'sortOrder=asc',
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
      );
      await waitFor(() => {
        expect(lastPath('/reconciliation/transactions')).toContain(
          'sortOrder=desc',
        );
      });
    });

    it('treats Keterangan as a real backend sort key', async () => {
      mockApi();
      renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');

      fireEvent.click(
        screen.getByRole('button', { name: 'Urutkan kolom Keterangan' }),
      );
      await waitFor(() => {
        expect(lastPath('/reconciliation/transactions')).toContain(
          'sortBy=description',
        );
      });
    });

    it('resets to page 1 when the sort changes', async () => {
      mockApi({ total: 120, totalPages: 3 });
      renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');

      fireEvent.click(
        screen.getByRole('button', { name: 'Halaman berikutnya' }),
      );
      await waitFor(() => {
        expect(lastPath('/reconciliation/transactions')).toContain('page=2');
      });

      fireEvent.click(
        screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
      );
      await waitFor(() => {
        expect(lastPath('/reconciliation/transactions')).toContain(
          'sortBy=amount',
        );
      });
      expect(lastPath('/reconciliation/transactions')).toContain('page=1');
    });

    it('does not refetch the summary when only the sort changes', async () => {
      mockApi();
      renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');

      const before = countPaths('/reconciliation/summary');

      fireEvent.click(
        screen.getByRole('button', { name: 'Urutkan kolom Jumlah' }),
      );
      await waitFor(() => {
        expect(lastPath('/reconciliation/transactions')).toContain(
          'sortBy=amount',
        );
      });

      expect(countPaths('/reconciliation/summary')).toBe(before);
    });

    it('renders the shared DataTable footer, with the page counter only when it means something', async () => {
      mockApi();
      const { unmount } = renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');
      // One page: footer present, range shown, both chevrons disabled.
      expect(screen.getByTestId('data-table-pagination')).toHaveTextContent(
        'Menampilkan 1–1 dari 1 transaksi',
      );
      expect(
        screen.getByRole('button', { name: 'Halaman berikutnya' }),
      ).toBeDisabled();
      unmount();

      vi.clearAllMocks();
      mockApi({ total: 120, totalPages: 3 });
      renderWithClient(<ReconciliationClient />);
      await screen.findByText('Setoran tunai');
      await waitFor(() => {
        expect(screen.getByTestId('data-table-pagination')).toHaveTextContent(
          'Menampilkan 1–50 dari 120 transaksi',
        );
      });
      expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent(
        '1 / 3',
      );
    });
  });
});
