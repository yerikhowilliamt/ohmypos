'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BranchResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { useDeleteBranch } from '@/hooks/useBranches';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { BranchFormDialog } from './BranchFormDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface BranchesTableProps {
  branches: BranchResponse[];
  isLoading?: boolean;
}

export function BranchesTable({
  branches,
  isLoading = false,
}: BranchesTableProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingBranch, setEditingBranch] =
    React.useState<BranchResponse | null>(null);
  const [deletingBranch, setDeletingBranch] =
    React.useState<BranchResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteBranch();

  const columns: ColumnDef<BranchResponse>[] = [
    {
      accessorKey: 'name',
      filterFn: (row, _columnId, filterValue) => {
        const q = String(filterValue).toLowerCase();
        return (
          row.original.name.toLowerCase().includes(q) ||
          (row.original.address ?? '').toLowerCase().includes(q)
        );
      },
      header: ({ column }) => (
        <SortableHeader label="Nama Cabang" column={column} />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'address',
      header: 'Alamat',
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {row.original.address ?? '—'}
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
            title="Edit cabang"
            onClick={() => setEditingBranch(row.original)}
            className="size-7 text-text-secondary hover:text-text-primary"
          >
            <Edit2 className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Hapus cabang"
            onClick={() => {
              setDeleteError(null);
              setDeletingBranch(row.original);
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
    if (!deletingBranch) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingBranch.id);
      setDeletingBranch(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Cabang tidak dapat dihapus karena masih memiliki staf atau transaksi terkait.',
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
          Tambah Cabang
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={branches}
        isLoading={isLoading}
        searchColumns={['name']}
        searchPlaceholder="Cari cabang atau alamat…"
        emptyMessage="Belum ada cabang terdaftar."
      />

      <BranchFormDialog
        open={isCreateOpen || Boolean(editingBranch)}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingBranch(null);
          }
        }}
        branch={editingBranch}
      />

      <DeleteConfirmDialog
        open={Boolean(deletingBranch)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingBranch(null);
            setDeleteError(null);
          }
        }}
        title="Hapus Cabang"
        description="Apakah Anda yakin ingin menghapus cabang ini? Tindakan ini tidak dapat dibatalkan."
        itemName={deletingBranch?.name}
        isDeleting={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
