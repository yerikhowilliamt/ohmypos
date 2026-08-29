'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { CategoryResponse } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { Edit2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ExpenseCategoryFormDialog } from './ExpenseCategoryFormDialog';
import { useDeleteCategory } from '@/hooks/useExpenses';

interface ExpenseCategoriesTableProps {
  categories: CategoryResponse[];
  isLoading?: boolean;
}

export function ExpenseCategoriesTable({
  categories,
  isLoading = false,
}: ExpenseCategoriesTableProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] =
    React.useState<CategoryResponse | null>(null);
  const [deletingCategory, setDeletingCategory] =
    React.useState<CategoryResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const deleteMutation = useDeleteCategory();

  const columns: ColumnDef<CategoryResponse>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <SortableHeader label="Nama Kategori" column={column} />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'isSystem',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isSystem ? (
          <Badge variant="outline" className="gap-1">
            <ShieldCheck data-icon="inline-start" />
            Sistem
          </Badge>
        ) : (
          <span className="text-sm text-text-secondary">Kustom</span>
        ),
    },
    {
      header: 'Aksi',
      meta: { align: 'center' },
      cell: ({ row }) => {
        const category = row.original;
        if (category.isSystem) {
          return (
            <span className="text-xs text-text-tertiary">
              Dilindungi sistem
            </span>
          );
        }
        return (
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit kategori pengeluaran"
              onClick={() => setEditingCategory(category)}
            >
              <Edit2 data-icon="icon" />
              <span className="sr-only">Edit {category.name}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Hapus kategori pengeluaran"
              className="text-status-danger hover:bg-status-danger/10"
              onClick={() => {
                setDeleteError(null);
                setDeletingCategory(category);
              }}
            >
              <Trash2 data-icon="icon" />
              <span className="sr-only">Hapus {category.name}</span>
            </Button>
          </div>
        );
      },
    },
  ];

  const handleDelete = async () => {
    if (!deletingCategory) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingCategory.id);
      setDeletingCategory(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Kategori tidak dapat dihapus karena masih dipakai transaksi.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          Tambah Kategori
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={categories}
        isLoading={isLoading}
        searchColumns={['name']}
        searchPlaceholder="Cari kategori pengeluaran…"
        emptyMessage="Belum ada kategori. Klik Tambah untuk membuat kategori seperti Listrik, Sewa, atau Gaji."
      />

      <ExpenseCategoryFormDialog
        open={isCreateOpen || Boolean(editingCategory)}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingCategory(null);
          }
        }}
        category={editingCategory}
      />

      <DeleteConfirmDialog
        open={Boolean(deletingCategory)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingCategory(null);
            setDeleteError(null);
          }
        }}
        title="Hapus Kategori Pengeluaran"
        description="Kategori yang dihapus tidak dapat dipilih untuk transaksi baru."
        itemName={deletingCategory?.name}
        isDeleting={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
