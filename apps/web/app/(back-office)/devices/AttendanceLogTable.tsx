'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  AttendanceRecordResponse,
  AttendanceViolationReason,
  BranchResponse,
} from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Checkbox } from '@ohmypos/ui/components/checkbox';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { useAttendanceRecords } from '@/hooks/useDevices';

const VIOLATION_LABELS: Record<AttendanceViolationReason, string> = {
  NO_DEVICE_COOKIE: 'Tanpa Cookie Toko (HP Pribadi)',
  DEVICE_NOT_REGISTERED: 'Perangkat Tidak Terdaftar',
  DEVICE_WRONG_BRANCH: 'Salah Cabang',
  DEVICE_INACTIVE: 'Perangkat Dinonaktifkan',
};

interface AttendanceLogTableProps {
  branches: BranchResponse[];
}

export function AttendanceLogTable({ branches }: AttendanceLogTableProps) {
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>('ALL');
  const [violationOnly, setViolationOnly] = React.useState<boolean>(false);

  const { data: records = [], isLoading } = useAttendanceRecords({
    branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
    violationOnly,
  });

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
            <Badge variant="success">Valid</Badge>
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
              Sesuai terminal toko
            </span>
          ),
      },
    ],
    [],
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
      />
    </div>
  );
}
