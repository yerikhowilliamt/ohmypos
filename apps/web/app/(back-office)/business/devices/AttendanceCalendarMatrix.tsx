'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  CalendarCheck,
  Download,
  TriangleAlert,
} from 'lucide-react';
import type { BranchResponse, UserResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ohmypos/ui/components/popover';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { useAttendanceRecords } from '@/hooks/useDevices';
import { useUsers } from '@/hooks/useUsers';
import { useAllLeaveRequests } from '@/hooks/useLeaveRequests';
import { exportMatrixToXlsx } from '@/lib/export';

const STATUS_LABELS: Record<'VALID' | 'VIOLATION' | 'LEAVE' | 'NONE', string> =
  {
    VALID: 'Hadir',
    VIOLATION: 'Pelanggaran',
    LEAVE: 'Cuti',
    NONE: '',
  };

interface AttendanceCalendarMatrixProps {
  branches: BranchResponse[];
}

/**
 * One page big enough to hold a whole month of logins: 8 kasir x 2 logins x 31
 * days = 496. Matches the `limit` ceiling on AttendanceQuerySchema. A month
 * past this is reported on screen, never silently trimmed.
 */
const MATRIX_PAGE_LIMIT = 500;

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function AttendanceCalendarMatrix({
  branches,
}: AttendanceCalendarMatrixProps) {
  const [currentDate, setCurrentDate] = React.useState<Date>(() => new Date());
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>('ALL');
  const [isExporting, setIsExporting] = React.useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calculate days in month
  const daysInMonth = React.useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const daysArray = React.useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  // Fetch all users (filter role = KASIR)
  const { data: allUsers = [], isLoading: isUsersLoading } = useUsers();
  const cashiers = React.useMemo(() => {
    return allUsers.filter(
      (u) =>
        u.role === 'KASIR' &&
        (selectedBranchId === 'ALL' || u.branchId === selectedBranchId),
    );
  }, [allUsers, selectedBranchId]);

  /**
   * The bounds of the month on screen, in local time. `endOfMonth` is the last
   * day at 23:59:59.999 rather than midnight — a midnight bound would drop
   * every login on the final day of every month.
   *
   * These are what makes the prev/next buttons above actually navigate. Before
   * they were sent, the query fetched the 200 most recent logins globally and
   * this component filtered them to `month` client-side, so any month older
   * than those 200 rows spanned rendered every cell blank — which on this
   * screen reads as "nobody came to work".
   */
  const { startOfMonth, endOfMonth, monthStartDay, monthEndDay } =
    React.useMemo(() => {
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const asDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        startOfMonth: start.toISOString(),
        endOfMonth: end.toISOString(),
        monthStartDay: asDay(start),
        monthEndDay: asDay(end),
      };
    }, [year, month]);

  // Fetch attendance records for the displayed month only.
  const { data: attendancePage, isLoading: isAttendanceLoading } =
    useAttendanceRecords({
      branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
      startDate: startOfMonth,
      endDate: endOfMonth,
      limit: MATRIX_PAGE_LIMIT,
    });
  const attendanceRecords = React.useMemo(
    () => attendancePage?.data ?? [],
    [attendancePage],
  );
  /**
   * A month bigger than one page must say so. Silently rendering the rows that
   * fit would blank the rest of the cells, and a blank cell here is not "not
   * loaded" — it is "absent". That is the exact defect this task removed, so it
   * is not allowed back in a new shape.
   */
  const omittedCount = Math.max(
    0,
    (attendancePage?.meta.total ?? 0) - attendanceRecords.length,
  );

  // Fetch approved leave overlapping the displayed month.
  const { data: leavePage, isLoading: isLeavesLoading } = useAllLeaveRequests({
    status: 'APPROVED',
    overlapsFrom: monthStartDay,
    overlapsTo: monthEndDay,
    limit: MATRIX_PAGE_LIMIT,
  });
  const leaveRequests = React.useMemo(() => leavePage?.data ?? [], [leavePage]);

  const isLoading = isUsersLoading || isAttendanceLoading || isLeavesLoading;

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  // Helper to map date to status for a cashier
  const getDayStatus = (cashier: UserResponse, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 1. Check if user is on approved leave on this date
    const onLeave = leaveRequests.find((l) => {
      if (l.userId !== cashier.id) return false;
      return dateStr >= l.startDate && dateStr <= l.endDate;
    });

    if (onLeave) {
      return {
        type: 'LEAVE' as const,
        data: onLeave,
      };
    }

    // 2. Check attendance records for this user on this day
    const recordsOnDay = attendanceRecords.filter((r) => {
      if (r.userId !== cashier.id) return false;
      const recordDate = new Date(r.loginAt);
      return (
        recordDate.getFullYear() === year &&
        recordDate.getMonth() === month &&
        recordDate.getDate() === day
      );
    });

    if (recordsOnDay.length > 0) {
      // If any record on this day is valid, mark as valid presence
      const validRecord = recordsOnDay.find((r) => r.isValid);
      if (validRecord) {
        return {
          type: 'VALID' as const,
          data: validRecord,
          count: recordsOnDay.length,
        };
      }
      // If only invalid records exist
      return {
        type: 'VIOLATION' as const,
        data: recordsOnDay[0],
        count: recordsOnDay.length,
      };
    }

    return {
      type: 'NONE' as const,
      data: null,
    };
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rowLabels = cashiers.map((cashier) => {
        const branchName =
          branches.find((b) => b.id === cashier.branchId)?.name ?? '—';
        return `${cashier.name} (${branchName})`;
      });
      await exportMatrixToXlsx(
        `absensi-matrix_${year}-${String(month + 1).padStart(2, '0')}.xlsx`,
        'Karyawan (Kasir)',
        daysArray.map(String),
        rowLabels,
        (rowIndex, columnIndex) => {
          const status = getDayStatus(
            cashiers[rowIndex]!,
            daysArray[columnIndex]!,
          );
          return STATUS_LABELS[status.type];
        },
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls: Month Switcher & Branch Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-raised p-3.5 rounded-lg border border-border-default shadow-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 w-52">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={handlePrevMonth}
              className="size-6"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-semibold text-sm text-text-primary w-full text-center">
              {MONTH_NAMES[month]} {year}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={handleNextMonth}
              className="size-6"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCurrentMonth}
            className="text-xs h-6 ml-1"
          >
            Bulan Ini
          </Button>
        </div>

        <div className="flex items-center gap-2 max-w-md">
          <div className="w-full min-w-[160px]">
            <Select
              value={selectedBranchId}
              onValueChange={setSelectedBranchId}
            >
              <SelectTrigger className="h-6 text-xs">
                <SelectValue placeholder="Pilih cabang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Cabang</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-6 shrink-0 gap-1.5"
            onClick={handleExport}
            disabled={isLoading || isExporting || cashiers.length === 0}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        </div>
      </div>

      {omittedCount > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2.5 text-xs text-text-primary"
        >
          <TriangleAlert
            className="size-4 shrink-0 text-status-warning mt-px"
            aria-hidden="true"
          />
          <span>
            Menampilkan {attendanceRecords.length.toLocaleString('id-ID')} dari{' '}
            {(attendancePage?.meta.total ?? 0).toLocaleString('id-ID')} log
            login bulan ini.{' '}
            <strong>{omittedCount.toLocaleString('id-ID')}</strong> log belum
            termuat, jadi sebagian sel kosong di bawah bisa jadi bukan
            ketidakhadiran. Persempit dengan filter cabang.
          </span>
        </div>
      ) : null}

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-text-secondary">
        <span className="text-text-tertiary text-[11px] font-medium">
          Keterangan:
        </span>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-status-success inline-block shadow-sm" />
          <span>Hadir (Valid)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-status-warning inline-block shadow-sm" />
          <span>Pelanggaran (HP/Luar)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-status-info inline-block shadow-sm" />
          <span>Cuti / Izin</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-border-strong inline-block" />
          <span>Tidak Hadir / Libur</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="rounded-xl border border-border-default bg-surface-raised shadow-1 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : cashiers.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-tertiary">
            Tidak ada kasir aktif yang ditemukan pada filter ini.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border-default bg-surface-muted/60 text-text-secondary">
                <th className="py-3 px-4 font-semibold sticky left-0 z-10 bg-surface-muted min-w-[160px]">
                  Karyawan (Kasir)
                </th>
                {daysArray.map((day) => {
                  const d = new Date(year, month, day);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday =
                    new Date().getDate() === day &&
                    new Date().getMonth() === month &&
                    new Date().getFullYear() === year;

                  return (
                    <th
                      key={day}
                      className={`p-1.5 text-center font-mono text-[11px] min-w-[34px] border-l border-border-default/40 ${
                        isToday
                          ? 'bg-brand-primary/10 text-brand-primary font-bold'
                          : isWeekend
                            ? 'text-text-tertiary bg-surface-muted/90'
                            : 'text-text-secondary'
                      }`}
                    >
                      {day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {cashiers.map((cashier) => {
                const branchName =
                  branches.find((b) => b.id === cashier.branchId)?.name ?? '—';

                return (
                  <tr
                    key={cashier.id}
                    className="hover:bg-surface-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-text-primary sticky left-0 z-10 bg-surface-raised border-r border-border-default">
                      <div className="font-semibold text-xs text-text-primary">
                        {cashier.name}
                      </div>
                      <div className="text-[10px] text-text-tertiary">
                        {branchName}
                      </div>
                    </td>

                    {daysArray.map((day) => {
                      const status = getDayStatus(cashier, day);
                      const d = new Date(year, month, day);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                      return (
                        <td
                          key={day}
                          className={`p-1 text-center border-l border-border-default/40 ${
                            isWeekend ? 'bg-surface-muted/20' : ''
                          }`}
                        >
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="size-6 mx-auto rounded-md flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                              >
                                {status.type === 'VALID' ? (
                                  <span className="size-3.5 rounded-full bg-status-success ring-2 ring-status-success/15" />
                                ) : status.type === 'VIOLATION' ? (
                                  <span className="size-3.5 rounded-full bg-status-warning ring-2 ring-status-warning/15" />
                                ) : status.type === 'LEAVE' ? (
                                  <span className="size-3.5 rounded-full bg-status-info ring-2 ring-status-info/15" />
                                ) : (
                                  <span className="size-1.5 rounded-full bg-border-strong" />
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="top"
                              align="center"
                              className="w-56 p-2.5 text-xs shadow-md font-sans"
                            >
                              <div className="font-semibold text-text-primary pb-1 border-b border-border-default">
                                {day} {MONTH_NAMES[month]} {year}
                              </div>
                              <div className="pt-1.5 space-y-1">
                                <p className="font-medium text-text-primary">
                                  {cashier.name}
                                </p>
                                {status.type === 'VALID' && (
                                  <div className="text-status-success">
                                    <p className="font-semibold flex items-center gap-1">
                                      <ShieldCheck className="size-3.5" /> Hadir
                                      (Valid)
                                    </p>
                                    <p className="text-[11px] text-text-tertiary">
                                      Login:{' '}
                                      {new Date(
                                        status.data.loginAt,
                                      ).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                    <p className="text-[11px] text-text-tertiary">
                                      Perangkat:{' '}
                                      {status.data.deviceLabel ?? 'Perangkat'}
                                    </p>
                                  </div>
                                )}
                                {status.type === 'VIOLATION' && (
                                  <div className="text-status-warning">
                                    <p className="font-semibold flex items-center gap-1">
                                      <ShieldAlert className="size-3.5" />{' '}
                                      Pelanggaran
                                    </p>
                                    <p className="text-[11px] text-text-tertiary">
                                      Login:{' '}
                                      {new Date(
                                        status.data.loginAt,
                                      ).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                    <p className="text-[11px] text-status-danger font-medium">
                                      {status.data.violationReason ??
                                        'HP Pribadi'}
                                    </p>
                                  </div>
                                )}
                                {status.type === 'LEAVE' && (
                                  <div className="text-status-info">
                                    <p className="font-semibold flex items-center gap-1">
                                      <CalendarCheck className="size-3.5" />{' '}
                                      Cuti / Izin Disetujui
                                    </p>
                                    <p className="text-[11px] text-text-tertiary">
                                      Alasan: {status.data.reason}
                                    </p>
                                  </div>
                                )}
                                {status.type === 'NONE' && (
                                  <p className="text-text-tertiary text-[11px] italic">
                                    Tidak ada catatan login atau cuti.
                                  </p>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
