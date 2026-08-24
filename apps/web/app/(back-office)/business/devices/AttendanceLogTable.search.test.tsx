import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { BranchResponse } from '@ohmypos/api-contracts';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';

const useAttendanceRecords = vi.fn();

vi.mock('@/hooks/useDevices', () => ({
  useAttendanceRecords: (params: unknown) => useAttendanceRecords(params),
  useUpdateAttendanceStatus: () => ({ mutate: vi.fn() }),
  fetchAttendanceRecordsPage: vi.fn(async () => ({
    data: [],
    meta: { total: 0, page: 1, limit: 100, totalPages: 1 },
  })),
}));
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  exportRowsToXlsx: vi.fn(),
}));

import { AttendanceLogTable } from './AttendanceLogTable';

const BRANCH = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Cabang Tebet',
} as BranchResponse;

const RECORD = {
  id: '55555555-5555-4555-8555-555555555555',
  userId: '44444444-4444-4444-8444-444444444444',
  userName: 'Sari',
  userEmail: 'sari@test.local',
  branchId: BRANCH.id,
  branchName: BRANCH.name,
  deviceId: null,
  deviceLabel: null,
  loginAt: '2026-08-20T02:00:00.000Z',
  isValid: true,
  violationReason: null,
  ipAddress: null,
  userAgent: null,
  createdAt: '2026-08-20T02:00:00.000Z',
};

/** The params object of the most recent `useAttendanceRecords` call. */
function lastParams(): Record<string, unknown> {
  const calls = useAttendanceRecords.mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as Record<string, unknown>;
}

/**
 * The search box on this table used to be a TanStack column filter over the 25
 * rows on screen — and could not search email at all, because no column carries
 * it (DEBT-047, DEBT-052). These cases pin the server-side replacement.
 */
describe('AttendanceLogTable server-side search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAttendanceRecords.mockReturnValue({
      data: {
        data: [RECORD],
        meta: { total: 120, page: 1, limit: 25, totalPages: 5 },
      },
      isLoading: false,
    });
  });

  it('sends no search parameter before anything is typed', () => {
    render(<AttendanceLogTable branches={[BRANCH]} />);
    expect(lastParams().search).toBeUndefined();
  });

  it('sends the keyword to the hook once typing settles', async () => {
    render(<AttendanceLogTable branches={[BRANCH]} />);

    fireEvent.change(screen.getByLabelText('Cari log absensi'), {
      target: { value: 'sari' },
    });

    await waitFor(() => {
      expect(lastParams().search).toBe('sari');
    });
  });

  it('accepts an email fragment as a keyword (DEBT-052)', async () => {
    // Nothing special is needed on this side — the point is that the value
    // reaches the API at all, where `user.email` is one of the OR clauses. The
    // old column filter could not do this: a column filter needs a column.
    render(<AttendanceLogTable branches={[BRANCH]} />);

    fireEvent.change(screen.getByLabelText('Cari log absensi'), {
      target: { value: '@test.local' },
    });

    await waitFor(() => {
      expect(lastParams().search).toBe('@test.local');
    });
  });

  it('returns to page 1 when the keyword changes', async () => {
    render(<AttendanceLogTable branches={[BRANCH]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await waitFor(() => {
      expect(lastParams().page).toBe(2);
    });

    fireEvent.change(screen.getByLabelText('Cari log absensi'), {
      target: { value: 'sari' },
    });

    // Both in one waitFor: asserting the page separately could read an
    // intermediate render and pass (or fail) on timing rather than on behaviour.
    await waitFor(() => {
      expect(lastParams()).toMatchObject({ search: 'sari', page: 1 });
    });
  });

  it('does not filter the rows it was handed', async () => {
    // The server decides which rows come back. If this table also filtered
    // client-side, a row matched only on email would arrive and then vanish.
    render(<AttendanceLogTable branches={[BRANCH]} />);

    fireEvent.change(screen.getByLabelText('Cari log absensi'), {
      target: { value: 'tidak ada yang cocok' },
    });

    await waitFor(() => {
      expect(lastParams().search).toBe('tidak ada yang cocok');
    });
    expect(screen.getByText('Sari')).toBeDefined();
  });

  it('drops the parameter when the box is cleared', async () => {
    render(<AttendanceLogTable branches={[BRANCH]} />);
    const box = screen.getByLabelText('Cari log absensi');

    fireEvent.change(box, { target: { value: 'sari' } });
    await waitFor(() => {
      expect(lastParams().search).toBe('sari');
    });

    fireEvent.change(box, { target: { value: '' } });
    await waitFor(() => {
      expect(lastParams().search).toBeUndefined();
    });
  });
});
