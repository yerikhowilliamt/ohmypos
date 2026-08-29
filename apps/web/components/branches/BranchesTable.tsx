'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BranchResponse } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { Edit2, Plus, Store, Trash2 } from 'lucide-react';
import { useDeleteBranch, useSetMainStore } from '@/hooks/useBranches';
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

  const [promotingBranch, setPromotingBranch] =
    React.useState<BranchResponse | null>(null);
  const [promoteError, setPromoteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteBranch();
  const setMainStoreMutation = useSetMainStore();

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
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isMainStore ? (
          <Badge variant="outline" className="gap-1">
            <Store className="size-3" />
            Toko Utama
          </Badge>
        ) : (
          <span className="text-sm text-text-secondary">Cabang</span>
        ),
    },
    {
      header: 'Aksi',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          {!row.original.isMainStore && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Jadikan toko utama"
              onClick={() => {
                setPromoteError(null);
                setPromotingBranch(row.original);
              }}
              className="size-7 text-text-secondary hover:text-text-primary"
            >
              <Store className="size-3.5" />
              <span className="sr-only">
                Jadikan toko utama {row.original.name}
              </span>
            </Button>
          )}
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

  const handlePromoteConfirm = async () => {
    if (!promotingBranch) return;
    setPromoteError(null);
    try {
      await setMainStoreMutation.mutateAsync(promotingBranch.id);
      setPromotingBranch(null);
    } catch (error) {
      setPromoteError(
        error instanceof Error
          ? error.message
          : 'Toko utama tidak dapat dipindahkan.',
      );
    }
  };

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

      <Dialog
        open={Boolean(promotingBranch)}
        onOpenChange={(open) => {
          if (!open) {
            setPromotingBranch(null);
            setPromoteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Jadikan Toko Utama</DialogTitle>
            <DialogDescription className="mt-2 text-text-secondary">
              Penanda toko utama hanya ada satu, jadi penanda ini akan berpindah
              dari toko yang memegangnya sekarang.
              {promotingBranch && (
                <span className="mt-2 block font-medium text-text-primary">
                  &quot;{promotingBranch.name}&quot;
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {promoteError && (
            <div
              role="alert"
              className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
            >
              {promoteError}
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={setMainStoreMutation.isPending}
              onClick={() => setPromotingBranch(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={setMainStoreMutation.isPending}
              onClick={handlePromoteConfirm}
            >
              {setMainStoreMutation.isPending
                ? 'Menyimpan…'
                : 'Jadikan Toko Utama'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
