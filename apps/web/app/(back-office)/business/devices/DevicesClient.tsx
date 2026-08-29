'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { DeviceResponse } from '@ohmypos/api-contracts';
import { PowerOff, Copy, Check, Edit2, Trash2 } from 'lucide-react';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { DeleteConfirmDialog } from '@/components/master-data/DeleteConfirmDialog';
import { useBranches } from '@/hooks/useBranches';
import {
  useCreateDevice,
  useDeactivateDevice,
  useDeleteDevice,
  useDevices,
  useUpdateDevice,
} from '@/hooks/useDevices';
import { DeviceFormDialog } from './DeviceFormDialog';

export function DevicesClient() {
  const { data: devices = [], isLoading } = useDevices();
  const { data: branches = [] } = useBranches();
  const createMutation = useCreateDevice();
  const updateMutation = useUpdateDevice();
  const deactivateMutation = useDeactivateDevice();
  const deleteMutation = useDeleteDevice();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingDevice, setEditingDevice] =
    React.useState<DeviceResponse | null>(null);
  const [deletingDevice, setDeletingDevice] =
    React.useState<DeviceResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!deletingDevice) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingDevice.id);
      setDeletingDevice(null);
    } catch (error) {
      // The API refuses a device that already has logins. Show its own wording
      // — it is the one that tells the Owner to deactivate instead.
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Perangkat belum terhapus. Periksa koneksi lalu coba lagi.',
      );
    }
  };

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
        // No longer gated on isActive: a device awaiting activation used to
        // have no action at all, which is exactly the one most likely to have
        // been created by mistake.
        cell: ({ row }) => {
          const device = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Edit perangkat"
                onClick={() => setEditingDevice(device)}
                className="size-7"
              >
                <Edit2 className="size-3.5" />
                <span className="sr-only">Edit {device.label}</span>
              </Button>
              {device.isActive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Nonaktifkan perangkat"
                  disabled={deactivateMutation.isPending}
                  onClick={() => deactivateMutation.mutate(device.id)}
                  className="size-7 text-status-danger hover:bg-status-danger/10"
                >
                  <PowerOff className="size-3.5" />
                  <span className="sr-only">Nonaktifkan {device.label}</span>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Hapus perangkat"
                onClick={() => {
                  setDeleteError(null);
                  setDeletingDevice(device);
                }}
                className="size-7 text-status-danger hover:bg-status-danger/10"
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Hapus {device.label}</span>
              </Button>
            </div>
          );
        },
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
        emptyMessage="Belum ada perangkat. Klik Tambah Perangkat untuk mendaftarkan tablet kasir pertama."
      />

      <DeviceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branches={branches}
        onSubmit={(data) => createMutation.mutateAsync(data)}
      />

      <DeviceFormDialog
        // Remounts per device so the form re-seeds its defaults without an
        // effect that would setState during render.
        key={editingDevice?.id ?? 'no-device'}
        open={Boolean(editingDevice)}
        onOpenChange={(open) => {
          if (!open) setEditingDevice(null);
        }}
        branches={branches}
        device={editingDevice}
        onSubmit={(data) =>
          updateMutation.mutateAsync({ id: editingDevice!.id, data })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(deletingDevice)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingDevice(null);
            setDeleteError(null);
          }
        }}
        title="Hapus Perangkat"
        description="Hanya perangkat yang belum pernah dipakai login yang bisa dihapus. Kalau sudah ada riwayat absensi, nonaktifkan saja — supaya log lamanya tetap menunjukkan perangkat asalnya."
        itemName={deletingDevice?.label}
        isDeleting={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDelete}
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
