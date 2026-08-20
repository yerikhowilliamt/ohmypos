'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, ShieldCheck, ShieldAlert } from 'lucide-react';
import type {
  AttendanceRecordResponse,
  AttendanceViolationReason,
  BranchResponse,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import {
  useAttendanceRecords,
  useUpdateAttendanceStatus,
} from '@/hooks/useDevices';

const VIOLATION_LABELS: Record<AttendanceViolationReason, string> = {
  NO_DEVICE_COOKIE: 'Tanpa Cookie Toko (HP Pribadi)',
  DEVICE_NOT_REGISTERED: 'Perangkat Tidak Terdaftar',
  DEVICE_WRONG_BRANCH: 'Salah Cabang',
  DEVICE_INACTIVE: 'Perangkat Dinonaktifkan',
};

interface AttendanceLogTableProps {
  branches: BranchResponse[];
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
  const [violationOnly, setViolationOnly] = React.useState<boolean>(false);

  const { data: records = [], isLoading } = useAttendanceRecords({
    branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
    violationOnly,
  });
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
              className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
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
                      className="text-xs text-emerald-700 dark:text-emerald-400 gap-2 cursor-pointer"
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
                        className="text-xs text-rose-600 dark:text-rose-400 gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="size-3.5" />
                        Tandai: HP Pribadi
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleSetViolation(record.id, 'DEVICE_WRONG_BRANCH')
                        }
                        className="text-xs text-rose-600 dark:text-rose-400 gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="size-3.5" />
                        Tandai: Salah Cabang
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleSetViolation(record.id, 'DEVICE_NOT_REGISTERED')
                        }
                        className="text-xs text-rose-600 dark:text-rose-400 gap-2 cursor-pointer"
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
              onValueChange={setSelectedBranchId}
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

        <div className="flex items-center gap-2">
          <Checkbox
            id="violation-only"
            checked={violationOnly}
            onChange={(e) => setViolationOnly(e.target.checked)}
          />
          <Label
            htmlFor="violation-only"
            className="cursor-pointer text-xs font-normal text-text-secondary"
          >
            Hanya tampilkan pelanggaran
          </Label>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={records}
        isLoading={isLoading}
        searchPlaceholder="Cari riwayat absensi…"
        searchColumns={['userName', 'userEmail', 'branchName', 'deviceLabel']}
        emptyMessage="Belum ada riwayat absensi login kasir."
        exportColumns={exportColumns}
        exportFilename={`log-absensi_${new Date().toISOString().slice(0, 10)}.xlsx`}
      />
    </div>
  );
}
