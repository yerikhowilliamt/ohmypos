'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { DeviceResponse } from '@ohmypos/api-contracts';
import { PowerOff, Copy, Check } from 'lucide-react';
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
        cell: ({ row }) => {
          const code = row.original.activationCode;
          if (!code)
            return <span className="text-xs text-text-secondary">—</span>;

          return <CopyActivationLink code={code} />;
        },
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
      <div className="rounded-lg border border-border-base bg-surface-base p-4">
        <h2 className="text-sm font-semibold text-text-primary">
          Langkah Aktivasi Perangkat Kasir
        </h2>
        <ol className="mt-2 list-none space-y-2 text-sm text-text-secondary">
          <li>
            <strong>1. Tambah perangkat:</strong> Masukkan nama perangkat dan
            pilih cabang toko.
          </li>
          <li>
            <strong>2. Buka tautan di tablet kasir:</strong> Salin link aktivasi
            dari tabel di bawah, lalu buka di browser tablet/HP yang dipakai di
            toko.
          </li>
          <li>
            <strong>3. Masuk akun Owner & aktifkan:</strong> Login akun Owner di
            browser tablet tersebut, lalu klik &apos;Aktifkan Perangkat
            Ini&apos;. Kode berlaku 15 menit.
          </li>
        </ol>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Daftar Perangkat
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola tablet atau perangkat toko yang diizinkan untuk login dan
            absensi kasir.
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

function CopyActivationLink({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = () => {
    const url = `${window.location.origin}/devices/activate?code=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-text-secondary">{code}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onCopy}
        title="Salin tautan aktivasi"
        className="size-6 text-text-secondary hover:text-text-primary"
      >
        {copied ? (
          <Check className="size-3 text-status-success" />
        ) : (
          <Copy className="size-3" />
        )}
      </Button>
    </div>
  );
}
