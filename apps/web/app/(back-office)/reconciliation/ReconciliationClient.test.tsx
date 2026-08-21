import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
});
