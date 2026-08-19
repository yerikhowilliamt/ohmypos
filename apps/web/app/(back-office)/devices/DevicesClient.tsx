'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { DeviceResponse } from '@ohmypos/api-contracts';
import { PowerOff } from 'lucide-react';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { useBranches } from '@/hooks/useBranches';
import {
  useCreateDevice,
  useDeactivateDevice,
  useDevices,
} from '@/hooks/useDevices';
import { AddDeviceDialog } from './AddDeviceDialog';

export function DevicesClient() {
  const { data: devices = [], isLoading } = useDevices();
  const { data: branches = [] } = useBranches();
  const createMutation = useCreateDevice();
  const deactivateMutation = useDeactivateDevice();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const branchName = React.useCallback(
    (branchId: string) =>
      branches.find((b) => b.id === branchId)?.name ?? branchId,
    [branches],
  );

  const columns = React.useMemo<ColumnDef<DeviceResponse>[]>(
    () => [
      {
        accessorKey: 'branchId',
        header: ({ column }) => (
          <SortableHeader label="Cabang" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-text-primary">
            {branchName(row.original.branchId)}
          </span>
        ),
      },
      {
        accessorKey: 'label',
        header: ({ column }) => (
          <SortableHeader label="Label" column={column} />
        ),
        cell: ({ row }) => <span>{row.original.label}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => (
          <SortableHeader label="Status" column={column} />
        ),
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="warning">Menunggu Aktivasi</Badge>
          ),
      },
      {
        accessorKey: 'activationCode',
        header: 'Kode Aktivasi',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-text-secondary">
            {row.original.activationCode ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.isActive ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Nonaktifkan perangkat"
                aria-label="Nonaktifkan perangkat"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(row.original.id)}
                className="size-7 text-status-danger hover:bg-status-danger/10"
              >
                <PowerOff className="size-3.5" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [branchName, deactivateMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Daftar Perangkat
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Daftar terminal/tablet resmi yang diizinkan untuk login kasir per
            cabang.
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          Tambah Perangkat
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={devices}
        isLoading={isLoading}
        searchPlaceholder="Cari perangkat…"
        searchColumns={['label', 'branchId']}
        emptyMessage="Belum ada perangkat terdaftar."
      />

      <AddDeviceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branches={branches}
        onSubmit={(data) => createMutation.mutateAsync(data)}
      />
    </div>
  );
}
