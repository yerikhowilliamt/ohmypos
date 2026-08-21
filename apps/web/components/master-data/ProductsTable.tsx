'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { ChefHat, Edit2, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatMarginPercentage } from '@/lib/formatters';
import { useDeleteProduct } from '@/hooks/useMasterData';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { ProductFormDialog } from './ProductFormDialog';
import { RecipeEditorDialog } from './RecipeEditorDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface ProductsTableProps {
  products: ProductWithHppResponse[];
  rawMaterials: RawMaterialResponse[];
  isLoading?: boolean;
}

export function ProductsTable({
  products,
  rawMaterials,
  isLoading = false,
}: ProductsTableProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] =
    React.useState<ProductWithHppResponse | null>(null);
  const [recipeProduct, setRecipeProduct] =
    React.useState<ProductWithHppResponse | null>(null);
  const [deletingProduct, setDeletingProduct] =
    React.useState<ProductWithHppResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteProduct();

  // Columns live inside the component: the cells close over the dialog state
  // setters (setRecipeProduct / setEditingProduct / setDeletingProduct /
  // setDeleteError), which are per-render closures — a module-level def cannot
  // reference them.
  const columns: ColumnDef<ProductWithHppResponse>[] = [
    {
      accessorKey: 'name',
      filterFn: 'includesString',
      header: ({ column }) => (
        <SortableHeader label="Nama Produk" column={column} />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">
            {row.original.name}
          </span>
          <div className="mt-0.5 flex items-center gap-1.5">
            {row.original.hasRecipe ? (
              <span className="text-[11px] text-status-success font-medium flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-status-success inline-block" />
                Resep aktif
              </span>
            ) : (
              <span className="text-[11px] text-status-warning font-medium flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-status-warning inline-block" />
                Belum ada resep
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorFn: (row) => Number(row.sellPrice),
      id: 'sellPrice',
      header: ({ column }) => (
        <SortableHeader label="Harga Jual" column={column} align="right" />
      ),
      cell: ({ row }) => (
        <span className="numeric font-mono font-medium text-text-primary">
          {formatCurrency(row.original.sellPrice)}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => Number(row.hpp ?? 0),
      id: 'hpp',
      header: ({ column }) => (
        <SortableHeader label="Live HPP" column={column} align="right" />
      ),
      cell: ({ row }) =>
        row.original.hpp ? (
          <span className="numeric font-mono text-text-primary">
            {formatCurrency(row.original.hpp)}
          </span>
        ) : (
          <span className="text-text-tertiary text-xs">—</span>
        ),
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => {
        const m = formatMarginPercentage(row.sellPrice, row.hpp);
        return m === null ? -Infinity : Number(m.replace(/[^\d.-]/g, ''));
      },
      id: 'margin',
      header: ({ column }) => (
        <SortableHeader label="Margin" column={column} align="right" />
      ),
      cell: ({ row }) => {
        const marginFormatted = formatMarginPercentage(
          row.original.sellPrice,
          row.original.hpp,
        );
        return marginFormatted ? (
          <span className="numeric font-mono font-medium text-accent-inflow">
            {marginFormatted}
          </span>
        ) : (
          <span className="text-text-tertiary text-xs">—</span>
        );
      },
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => row.makeableQuantity ?? -1,
      id: 'makeableQuantity',
      header: ({ column }) => (
        <SortableHeader label="Dapat Dibuat" column={column} align="right" />
      ),
      cell: ({ row }) =>
        row.original.makeableQuantity !== null ? (
          <span className="numeric font-mono text-xs font-medium text-text-secondary bg-surface-muted px-2 py-0.5 rounded-xs">
            {row.original.makeableQuantity} porsi
          </span>
        ) : (
          <span className="text-text-tertiary text-xs">—</span>
        ),
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => row.isActive,
      id: 'status',
      header: ({ column }) => <SortableHeader label="Status" column={column} />,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success" className="text-[11px]">
            Aktif
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[11px]">
            Nonaktif
          </Badge>
        ),
      meta: { align: 'center' },
    },
    {
      header: 'Aksi',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Kelola resep (BOM)"
            onClick={() => setRecipeProduct(row.original)}
            className="size-7 text-accent-outflow hover:bg-surface-strong"
          >
            <ChefHat className="size-3.5" />
            <span className="sr-only">Edit Resep</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Edit produk"
            onClick={() => setEditingProduct(row.original)}
            className="size-7 text-text-secondary hover:text-text-primary"
          >
            <Edit2 className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Hapus produk"
            onClick={() => {
              setDeleteError(null);
              setDeletingProduct(row.original);
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
    if (!deletingProduct) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingProduct.id);
      setDeletingProduct(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Produk tidak dapat dihapus karena memiliki riwayat penjualan. Nonaktifkan produk jika tidak lagi dijual.',
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: Add Button (search lives in DataTable) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 w-full sm:w-auto justify-center"
        >
          <Plus className="size-4" />
          Tambah Produk
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={products}
        isLoading={isLoading}
        searchColumns={['name']}
        searchPlaceholder="Cari nama produk / menu…"
        emptyMessage="Belum ada produk terdaftar."
      />

      {/* Create / Edit Product Dialog */}
      <ProductFormDialog
        open={isCreateOpen || Boolean(editingProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingProduct(null);
          }
        }}
        product={editingProduct}
      />

      {/* Recipe / BOM Editor Dialog */}
      <RecipeEditorDialog
        open={Boolean(recipeProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setRecipeProduct(null);
          }
        }}
        product={recipeProduct}
        rawMaterials={rawMaterials}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingProduct(null);
            setDeleteError(null);
          }
        }}
        title="Hapus Produk"
        description="Apakah Anda yakin ingin menghapus produk ini? Tindakan ini tidak dapat dibatalkan jika produk belum memiliki riwayat transaksi."
        itemName={deletingProduct?.name}
        isDeleting={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
