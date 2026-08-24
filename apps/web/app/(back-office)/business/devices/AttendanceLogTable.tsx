'use client';

import * as React from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { MoreHorizontal, ShieldCheck, ShieldAlert } from 'lucide-react';
import type {
  AttendanceRecordResponse,
  AttendanceSortBy,
  AttendanceViolationReason,
  BranchResponse,
  SortOrder,
} from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { Checkbox } from '@ohmypos/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ohmypos/ui/components/dropdown-menu';
import { Label } from '@ohmypos/ui/components/label';
import { DatePicker } from '@ohmypos/ui/components/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { rangeSuffix, type ExportColumn } from '@/lib/export';
import {
  fetchAttendanceRecordsPage,
  useAttendanceRecords,
  useUpdateAttendanceStatus,
} from '@/hooks/useDevices';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const VIOLATION_LABELS: Record<AttendanceViolationReason, string> = {
  NO_DEVICE_COOKIE: 'Tanpa Cookie Toko (HP Pribadi)',
  DEVICE_NOT_REGISTERED: 'Perangkat Tidak Terdaftar',
  DEVICE_WRONG_BRANCH: 'Salah Cabang',
  DEVICE_INACTIVE: 'Perangkat Dinonaktifkan',
};

interface AttendanceLogTableProps {
  branches: BranchResponse[];
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Only these four are sortable server-side. Any other column id falls back to
 * `loginAt` rather than being forwarded — a column the API cannot order by
 * would otherwise be accepted and quietly ignored, which is the failure this
 * whole series of tasks exists to remove.
 */
const SORTABLE_COLUMN_IDS: AttendanceSortBy[] = [
  'loginAt',
  'userName',
  'branchName',
  'deviceLabel',
  'isValid',
  'createdAt',
];

function toAttendanceSortBy(columnId: string | undefined): AttendanceSortBy {
  return SORTABLE_COLUMN_IDS.includes(columnId as AttendanceSortBy)
    ? (columnId as AttendanceSortBy)
    : 'loginAt';
}

const exportColumns: ExportColumn<AttendanceRecordResponse>[] = [
  { header: 'Waktu Login', accessor: (row) => new Date(row.loginAt) },
  { header: 'Karyawan', accessor: (row) => row.userName },
  { header: 'Email', accessor: (row) => row.userEmail },
  { header: 'Cabang', accessor: (row) => row.branchName ?? '—' },
  {
    header: 'Perangkat',
    accessor: (row) => row.deviceLabel ?? 'Perangkat Luar',
  },
  {
    header: 'Status',
    accessor: (row) => (row.isValid ? 'Valid' : 'Pelanggaran'),
  },
  {
    header: 'Catatan / Alasan',
    accessor: (row) =>
      row.violationReason ? VIOLATION_LABELS[row.violationReason] : '',
  },
];

export function AttendanceLogTable({ branches }: AttendanceLogTableProps) {
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>('ALL');
  const [searchInput, setSearchInput] = React.useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [violationOnly, setViolationOnly] = React.useState<boolean>(false);
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'loginAt', desc: true },
  ]);

  const activeSort = sorting[0];

  // One object for both the on-screen query and the Export loop. Rebuilding the
  // filters separately for the export is how the file quietly ends up holding a
  // different set from the one the operator is looking at (DEBT-048).
  const queryParams = React.useMemo(
    () => ({
      search: search || undefined,
      branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
      violationOnly,
      startDate: startDate
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : undefined,
      // Inclusive of the whole final day — a midnight bound would silently drop
      // every login made after 00:00 on the day the reader picked.
      endDate: endDate
        ? new Date(`${endDate}T23:59:59.999`).toISOString()
        : undefined,
      page,
      limit,
      sortBy: toAttendanceSortBy(activeSort?.id),
      sortOrder: (activeSort?.desc === false ? 'asc' : 'desc') as SortOrder,
    }),
    [
      search,
      selectedBranchId,
      violationOnly,
      startDate,
      endDate,
      page,
      limit,
      activeSort?.id,
      activeSort?.desc,
    ],
  );

  const { data, isLoading } = useAttendanceRecords(queryParams);

  const exportAll = React.useCallback(
    () =>
      fetchAllPages((exportPage, exportLimit) =>
        fetchAttendanceRecordsPage({
          ...queryParams,
          page: exportPage,
          limit: exportLimit,
        }),
      ),
    [queryParams],
  );

  const records = React.useMemo(() => data?.data ?? [], [data?.data]);
  const paginationMeta = data?.meta ?? {
    total: 0,
    page,
    limit,
    totalPages: 1,
  };

  // Every filter and sort change resets to page 1: staying on page 7 of a
  // result set that just shrank to two pages shows an empty table. The search
  // box claims page 1 at KEYSTROKE time rather than when the debounced value
  // lands, so no request ever goes out with the new keyword and the old page.
  const handleSearchChange = React.useCallback((value: string) => {
    setSearchInput(value);
    setPage(1);
  }, []);

  const handleSortingChange = React.useCallback(
    (updater: React.SetStateAction<SortingState>) => {
      setSorting(updater);
      setPage(1);
    },
    [],
  );

  const hasActiveFilter =
    !!searchInput ||
    selectedBranchId !== 'ALL' ||
    violationOnly ||
    !!startDate ||
    !!endDate;

  const handleResetFilters = React.useCallback(() => {
    setSearchInput('');
    setSelectedBranchId('ALL');
    setViolationOnly(false);
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, []);

  const updateStatusMutation = useUpdateAttendanceStatus();

  const handleSetValid = React.useCallback(
    (recordId: string) => {
      updateStatusMutation.mutate({
        id: recordId,
        isValid: true,
        violationReason: null,
      });
    },
    [updateStatusMutation],
  );

  const handleSetViolation = React.useCallback(
    (
      recordId: string,
      reason: AttendanceViolationReason = 'NO_DEVICE_COOKIE',
    ) => {
      updateStatusMutation.mutate({
        id: recordId,
        isValid: false,
        violationReason: reason,
      });
    },
    [updateStatusMutation],
  );

  const columns = React.useMemo<ColumnDef<AttendanceRecordResponse>[]>(
    () => [
      {
        accessorKey: 'loginAt',
        header: ({ column }) => (
          <SortableHeader label="Waktu Login" column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {new Date(row.original.loginAt).toLocaleString('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        ),
      },
      {
        accessorKey: 'userName',
        header: ({ column }) => (
          <SortableHeader label="Karyawan" column={column} />
        ),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-text-primary">
              {row.original.userName}
            </div>
            <div className="text-xs text-text-tertiary">
              {row.original.userEmail}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'branchName',
        header: ({ column }) => (
          <SortableHeader label="Cabang" column={column} />
        ),
        cell: ({ row }) => <span>{row.original.branchName ?? '—'}</span>,
      },
      {
        accessorKey: 'deviceLabel',
        header: ({ column }) => (
          <SortableHeader label="Perangkat" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-text-secondary">
            {row.original.deviceLabel ?? 'Perangkat Luar'}
          </span>
        ),
      },
      {
        accessorKey: 'isValid',
        header: ({ column }) => (
          <SortableHeader label="Status" column={column} />
        ),
        cell: ({ row }) =>
          row.original.isValid ? (
            <Badge
              variant="secondary"
              className="bg-status-success/10 text-status-success border-status-success/30"
            >
              Valid
            </Badge>
          ) : (
            <Badge variant="destructive">Pelanggaran</Badge>
          ),
      },
      {
        accessorKey: 'violationReason',
        header: 'Catatan / Alasan',
        cell: ({ row }) =>
          row.original.violationReason ? (
            <span className="text-xs font-medium text-status-danger">
              {VIOLATION_LABELS[row.original.violationReason]}
            </span>
          ) : (
            <span className="text-xs text-text-tertiary">
              Sesuai perangkat toko
            </span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="text-right block">Koreksi</span>,
        cell: ({ row }) => {
          const record = row.original;
          const isPending = updateStatusMutation.isPending;

          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-text-tertiary hover:text-text-primary"
                    disabled={isPending}
                  >
                    <span className="sr-only">Buka menu koreksi</span>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs">
                    Ubah Status Absensi
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {!record.isValid ? (
                    <DropdownMenuItem
                      onClick={() => handleSetValid(record.id)}
                      className="text-xs text-status-success gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="size-3.5" />
                      Tandai Sebagai Valid
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem
                        onClick={() =>
                          handleSetViolation(record.id, 'NO_DEVICE_COOKIE')
                        }
                        className="text-xs text-status-danger gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="size-3.5" />
                        Tandai: HP Pribadi
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleSetViolation(record.id, 'DEVICE_WRONG_BRANCH')
                        }
                        className="text-xs text-status-danger gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="size-3.5" />
                        Tandai: Salah Cabang
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleSetViolation(record.id, 'DEVICE_NOT_REGISTERED')
                        }
                        className="text-xs text-status-danger gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="size-3.5" />
                        Tandai: Tak Terdaftar
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [handleSetValid, handleSetViolation, updateStatusMutation.isPending],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Label
            htmlFor="attendance-branch-filter"
            className="text-xs font-medium text-text-secondary whitespace-nowrap"
          >
            Cabang:
          </Label>
          <div className="w-[200px]">
            <Select
              value={selectedBranchId}
              onValueChange={(next) => {
                setSelectedBranchId(next);
                setPage(1);
              }}
            >
              <SelectTrigger
                id="attendance-branch-filter"
                className="h-6 text-xs"
              >
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
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <div className="flex items-center gap-1">
            <span className="whitespace-nowrap">Dari:</span>
            <DatePicker
              value={startDate}
              onChange={(date) => {
                setStartDate(date ?? '');
                setPage(1);
              }}
              placeholder="Mulai"
              className="h-6 text-xs w-36"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="whitespace-nowrap">Sampai:</span>
            <DatePicker
              value={endDate}
              onChange={(date) => {
                setEndDate(date ?? '');
                setPage(1);
              }}
              placeholder="Selesai"
              className="h-6 text-xs w-36"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="violation-only"
              checked={violationOnly}
              onChange={(e) => {
                setViolationOnly(e.target.checked);
                setPage(1);
              }}
            />
            <Label
              htmlFor="violation-only"
              className="cursor-pointer text-xs font-normal text-text-secondary"
            >
              Hanya tampilkan pelanggaran
            </Label>
          </div>
          {hasActiveFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleResetFilters}
            >
              Reset Filter
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={records}
        isLoading={isLoading}
        // Email is searchable here even though no column carries it: the
        // server matches `user.email`, so the row that only matches on email
        // still comes back. That is what the old client-side filter could not
        // do (DEBT-052) — a column filter needs a column.
        serverSearch={{ value: searchInput, onChange: handleSearchChange }}
        searchPlaceholder="Cari karyawan, email, cabang, atau perangkat…"
        searchLabel="Cari log absensi"
        emptyMessage="Belum ada riwayat absensi login kasir."
        exportColumns={exportColumns}
        exportFilename={`log-absensi_${rangeSuffix(startDate, endDate)}.xlsx`}
        exportAll={exportAll}
        exportTotal={paginationMeta.total}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        pagination={{
          meta: paginationMeta,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
          itemNoun: 'log absensi',
        }}
      />
    </div>
  );
}
