'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BranchResponse, UserResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { Edit2, RotateCcw, Trash2, Plus } from 'lucide-react';
import { useDeactivateUser, useReactivateUser } from '@/hooks/useUsers';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { CreateUserDialog } from './CreateUserDialog';
import { EditUserDialog } from './EditUserDialog';
import { DeactivateConfirmDialog } from './DeactivateConfirmDialog';

interface UsersTableProps {
  users: UserResponse[];
  branches: BranchResponse[];
  isLoading?: boolean;
}

const ROLE_BADGE_VARIANT: Record<
  UserResponse['role'],
  'default' | 'secondary' | 'outline'
> = {
  OWNER: 'default',
  ADMIN: 'secondary',
  KASIR: 'outline',
};

const ROLE_LABELS: Record<UserResponse['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

export function UsersTable({
  users,
  branches,
  isLoading = false,
}: UsersTableProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserResponse | null>(
    null,
  );
  const [deactivatingUser, setDeactivatingUser] =
    React.useState<UserResponse | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const deactivateMutation = useDeactivateUser();
  const reactivateMutation = useReactivateUser();

  const branchNameById = React.useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const columns: ColumnDef<UserResponse>[] = [
    {
      accessorKey: 'name',
      filterFn: (row, _columnId, filterValue) => {
        const q = String(filterValue).toLowerCase();
        return (
          row.original.name.toLowerCase().includes(q) ||
          row.original.email.toLowerCase().includes(q)
        );
      },
      header: ({ column }) => <SortableHeader label="Nama" column={column} />,
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-text-primary">
            {row.original.name}
          </div>
          <div className="text-xs text-text-tertiary">{row.original.email}</div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Peran',
      cell: ({ row }) => (
        <Badge variant={ROLE_BADGE_VARIANT[row.original.role]}>
          {ROLE_LABELS[row.original.role]}
        </Badge>
      ),
    },
    {
      accessorKey: 'branchId',
      header: 'Cabang',
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {row.original.branchId
            ? (branchNameById.get(row.original.branchId) ?? '—')
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="danger">Nonaktif</Badge>
        ),
    },
    {
      header: 'Aksi',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Edit pengguna"
            onClick={() => setEditingUser(row.original)}
            className="size-7 text-text-secondary hover:text-text-primary"
          >
            <Edit2 className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          {row.original.isActive ? (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Hapus pengguna"
              onClick={() => {
                setActionError(null);
                setDeactivatingUser(row.original);
              }}
              className="size-7 text-status-danger hover:bg-status-danger/10"
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">Hapus</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Aktifkan kembali"
              onClick={async () => {
                setActionError(null);
                try {
                  await reactivateMutation.mutateAsync(row.original.id);
                } catch (error) {
                  setActionError(
                    error instanceof Error
                      ? error.message
                      : 'Pengguna belum diaktifkan kembali. Periksa koneksi lalu coba lagi.',
                  );
                }
              }}
              className="size-7 text-status-success hover:bg-status-success/10"
            >
              <RotateCcw className="size-3.5" />
              <span className="sr-only">Aktifkan</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  const handleDeactivateConfirm = async () => {
    if (!deactivatingUser) return;
    setActionError(null);
    try {
      await deactivateMutation.mutateAsync(deactivatingUser.id);
      setDeactivatingUser(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Pengguna belum dinonaktifkan. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 w-full sm:w-auto justify-center"
        >
          <Plus className="size-4" />
          Tambah Pengguna
        </Button>
      </div>

      {actionError && !deactivatingUser && (
        <div
          role="alert"
          className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
        >
          {actionError}
        </div>
      )}

      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        searchColumns={['name']}
        searchPlaceholder="Cari nama atau email…"
        emptyMessage="Belum ada pengguna lain. Klik Tambah untuk membuat akun kasir atau admin."
      />

      <CreateUserDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <EditUserDialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null);
        }}
        user={editingUser}
      />

      <DeactivateConfirmDialog
        open={Boolean(deactivatingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivatingUser(null);
            setActionError(null);
          }
        }}
        userName={deactivatingUser?.name}
        isSubmitting={deactivateMutation.isPending}
        errorMessage={actionError}
        onConfirm={handleDeactivateConfirm}
      />
    </div>
  );
}
