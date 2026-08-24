'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { AccountResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { useDeleteAccount } from '@/hooks/useAccounts';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { formatAccountType } from '@/lib/vocabulary';
import { formatCurrency } from '@/lib/formatters';
import { AccountFormDialog } from './AccountFormDialog';
import { DeleteConfirmDialog } from '@/components/branches/DeleteConfirmDialog';

interface AccountsTableProps {
  accounts: AccountResponse[];
  isLoading?: boolean;
}

export function AccountsTable({
  accounts,
  isLoading = false,
}: AccountsTableProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] =
    React.useState<AccountResponse | null>(null);
  const [deletingAccount, setDeletingAccount] =
    React.useState<AccountResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteAccount();

  const columns: ColumnDef<AccountResponse>[] = [
    {
      accessorKey: 'name',
      filterFn: (row, _columnId, filterValue) => {
        const q = String(filterValue).toLowerCase();
        return (
          row.original.name.toLowerCase().includes(q) ||
          formatAccountType(row.original.type).toLowerCase().includes(q)
        );
      },
      header: ({ column }) => (
        <SortableHeader label="Nama Akun / Metode" column={column} />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Tipe Akun',
      cell: ({ row }) => {
        const type = row.original.type;
        return <Badge variant="outline">{formatAccountType(type)}</Badge>;
      },
    },
    {
      accessorKey: 'openingBalance',
      meta: { align: 'right' },
      header: ({ column }) => (
        <SortableHeader label="Kas Awal" column={column} />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-text-primary">
          {formatCurrency(row.original.openingBalance)}
        </span>
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
            title="Edit metode pembayaran"
            onClick={() => setEditingAccount(row.original)}
            className="size-7 text-text-secondary hover:text-text-primary"
          >
            <Edit2 className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Hapus metode pembayaran"
            onClick={() => {
              setDeleteError(null);
              setDeletingAccount(row.original);
            }}
            className="size-7 text-status-danger hover:bg-status-danger/10"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Hapus</span>
          </Button>
        </div>
      ),
    },
  ];

  const handleDeleteConfirm = async () => {
    if (!deletingAccount) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingAccount.id);
      setDeletingAccount(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Metode pembayaran tidak dapat dihapus karena masih memiliki transaksi terkait.',
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
          Tambah Metode Pembayaran
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={accounts}
        isLoading={isLoading}
        searchColumns={['name']}
        searchPlaceholder="Cari nama atau tipe metode pembayaran…"
        emptyMessage="Belum ada rekening atau kas yang didaftarkan."
      />

      <AccountFormDialog
        open={isCreateOpen || Boolean(editingAccount)}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingAccount(null);
          }
        }}
        account={editingAccount}
      />

      <DeleteConfirmDialog
        open={Boolean(deletingAccount)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingAccount(null);
            setDeleteError(null);
          }
        }}
        title="Hapus Metode Pembayaran"
        description="Apakah Anda yakin ingin menghapus akun/metode pembayaran ini? Tindakan ini tidak dapat dibatalkan."
        itemName={deletingAccount?.name}
        isDeleting={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
