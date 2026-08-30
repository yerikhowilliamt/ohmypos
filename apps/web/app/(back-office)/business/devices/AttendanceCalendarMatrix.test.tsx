import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  AttendanceListResponse,
  BranchResponse,
  LeaveRequestListResponse,
} from '@ohmypos/api-contracts';
import {
  AttendanceQuerySchema,
  LeaveRequestListQuerySchema,
} from '@ohmypos/api-contracts';

const useAttendanceRecords = vi.fn();
const useAllLeaveRequests = vi.fn();
const useUsers = vi.fn();

vi.mock('@/hooks/useDevices', () => ({
  useAttendanceRecords: (params: unknown) => useAttendanceRecords(params),
}));
vi.mock('@/hooks/useLeaveRequests', () => ({
  useAllLeaveRequests: (params: unknown) => useAllLeaveRequests(params),
}));
vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => useUsers(),
}));
vi.mock('@/lib/export', () => ({
  exportMatrixToXlsx: vi.fn(),
}));

import { AttendanceCalendarMatrix } from './AttendanceCalendarMatrix';

const BRANCH: BranchResponse = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Cabang Tebet',
} as BranchResponse;

const KASIR = {
  id: '44444444-4444-4444-4444-444444444444',
  name: 'Sari',
  email: 'sari@test.local',
  role: 'KASIR',
  branchId: BRANCH.id,
  isActive: true,
};

function attendancePage(
  total: number,
  rows: AttendanceListResponse['data'] = [],
): { data: AttendanceListResponse; isLoading: boolean } {
  return {
    data: {
      data: rows,
      meta: { total, page: 1, limit: 500, totalPages: 1 },
    },
    isLoading: false,
  };
}

const EMPTY_LEAVE: { data: LeaveRequestListResponse; isLoading: boolean } = {
  data: { data: [], meta: { total: 0, page: 1, limit: 500, totalPages: 1 } },
  isLoading: false,
};

describe('AttendanceCalendarMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsers.mockReturnValue({ data: [KASIR], isLoading: false });
    useAllLeaveRequests.mockReturnValue(EMPTY_LEAVE);
    useAttendanceRecords.mockReturnValue(attendancePage(0));
  });

  it('asks the server for the displayed month instead of the newest N logins', () => {
    render(<AttendanceCalendarMatrix branches={[BRANCH]} />);

    const params = useAttendanceRecords.mock.calls[0]![0] as {
      startDate?: string;
      endDate?: string;
    };
    expect(params.startDate).toBeDefined();
    expect(params.endDate).toBeDefined();

    const start = new Date(params.startDate!);
    const end = new Date(params.endDate!);
    const now = new Date();
    expect(start.getMonth()).toBe(now.getMonth());
    expect(start.getDate()).toBe(1);
    // The upper bound must cover the whole final day. A midnight bound would
    // silently drop every login made on the last day of every month.
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('bounds the leave query to the same month rather than fetching all history', () => {
    render(<AttendanceCalendarMatrix branches={[BRANCH]} />);

    const params = useAllLeaveRequests.mock.calls[0]![0] as {
      status?: string;
      overlapsFrom?: string;
      overlapsTo?: string;
    };
    expect(params.status).toBe('APPROVED');
    expect(params.overlapsFrom).toMatch(/^\d{4}-\d{2}-01$/);
    expect(params.overlapsTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * ERR-047 lolos karena test di atas memeriksa parameter terhadap fetch yang
   * di-mock, dan mock menerima apa pun. Test ini memeriksa parameter yang
   * sama terhadap schema Zod yang benar-benar dipakai endpoint-nya, jadi
   * ketidakcocokan kontrak gagal di sini alih-alih di browser.
   */
  it('mengirim query cuti yang benar-benar diterima LeaveRequestListQuerySchema', () => {
    render(<AttendanceCalendarMatrix branches={[BRANCH]} />);

    const params = useAllLeaveRequests.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    const parsed = LeaveRequestListQuerySchema.safeParse(params);

    expect(parsed.success).toBe(true);
  });

  it('mengirim query absensi yang benar-benar diterima AttendanceQuerySchema', () => {
    render(<AttendanceCalendarMatrix branches={[BRANCH]} />);

    const params = useAttendanceRecords.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    const parsed = AttendanceQuerySchema.safeParse(params);

    expect(parsed.success).toBe(true);
  });

  it('warns when the month holds more logins than were returned', () => {
    // 640 logins exist, 500 came back. The 140 missing ones would otherwise
    // render as blank cells, and a blank cell on this screen reads as "absent".
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `row-${i}`,
      userId: KASIR.id,
      userName: KASIR.name,
      userEmail: KASIR.email,
      branchId: BRANCH.id,
      branchName: BRANCH.name,
      deviceId: null,
      deviceLabel: null,
      loginAt: new Date().toISOString(),
      isValid: true,
      violationReason: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date().toISOString(),
    })) as AttendanceListResponse['data'];
    useAttendanceRecords.mockReturnValue(attendancePage(640, rows));

    render(<AttendanceCalendarMatrix branches={[BRANCH]} />);

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('640');
    expect(status.textContent).toContain('140');
  });

  it('shows no warning when the whole month fits in one page', () => {
    useAttendanceRecords.mockReturnValue(attendancePage(0));

    render(<AttendanceCalendarMatrix branches={[BRANCH]} />);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
