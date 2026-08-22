import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { UserResponse } from '@ohmypos/api-contracts';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';

const useSales = vi.fn();

vi.mock('@/hooks/usePos', () => ({
  useSales: (params: unknown) => useSales(params),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ data: [] }),
}));

import { SalesHistoryClient } from './SalesHistoryClient';

const OWNER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pemilik',
  email: 'owner@test.local',
  role: 'OWNER',
  branchId: null,
  isActive: true,
} as unknown as UserResponse;

/** The params object of the most recent `useSales` call. */
function lastParams(): Record<string, unknown> {
  const calls = useSales.mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as Record<string, unknown>;
}

/**
 * The search box here filtered the 10 rows on screen while looking like it
 * searched the whole sales history (DEBT-047). These cases pin the server-side
 * replacement.
 */
describe('SalesHistoryClient server-side search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSales.mockReturnValue({
      data: {
        data: [],
        meta: { total: 120, page: 1, limit: 10, totalPages: 12 },
      },
      isLoading: false,
    });
  });

  it('sends no search parameter before anything is typed', () => {
    render(<SalesHistoryClient user={OWNER} />);
    expect(lastParams().search).toBeUndefined();
  });

  it('sends the keyword to the hook once typing settles', async () => {
    render(<SalesHistoryClient user={OWNER} />);

    fireEvent.change(screen.getByLabelText('Cari riwayat penjualan'), {
      target: { value: 'tebet' },
    });

    await waitFor(() => {
      expect(lastParams().search).toBe('tebet');
    });
  });

  it('returns to page 1 when the keyword changes', async () => {
    render(<SalesHistoryClient user={OWNER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => {
      expect(lastParams().page).toBe(2);
    });

    fireEvent.change(screen.getByLabelText('Cari riwayat penjualan'), {
      target: { value: 'tebet' },
    });

    // Both in one waitFor: asserting the page separately could read an
    // intermediate render and pass (or fail) on timing rather than on behaviour.
    await waitFor(() => {
      expect(lastParams()).toMatchObject({ search: 'tebet', page: 1 });
    });
  });

  it('drops the parameter when the box is cleared', async () => {
    render(<SalesHistoryClient user={OWNER} />);
    const box = screen.getByLabelText('Cari riwayat penjualan');

    fireEvent.change(box, { target: { value: 'tebet' } });
    await waitFor(() => {
      expect(lastParams().search).toBe('tebet');
    });

    fireEvent.change(box, { target: { value: '' } });
    await waitFor(() => {
      expect(lastParams().search).toBeUndefined();
    });
  });

  it('clears the keyword with Reset Filter', async () => {
    render(<SalesHistoryClient user={OWNER} />);

    fireEvent.change(screen.getByLabelText('Cari riwayat penjualan'), {
      target: { value: 'tebet' },
    });
    await waitFor(() => {
      expect(lastParams().search).toBe('tebet');
    });

    fireEvent.click(screen.getByRole('button', { name: /reset filter/i }));

    await waitFor(() => {
      expect(lastParams().search).toBeUndefined();
    });
  });
});
