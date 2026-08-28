'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { RawMaterialResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatQuantity } from '@/lib/formatters';
import { useDeleteRawMaterial } from '@/hooks/useMasterData';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { RawMaterialFormDialog } from './RawMaterialFormDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface RawMaterialsTableProps {
  materials: RawMaterialResponse[];
  isLoading?: boolean;
}

export function RawMaterialsTable({
  materials,
  isLoading = false,
}: RawMaterialsTableProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingMaterial, setEditingMaterial] =
    React.useState<RawMaterialResponse | null>(null);
  const [deletingMaterial, setDeletingMaterial] =
    React.useState<RawMaterialResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteRawMaterial();

  // Columns live inside the component: the Aksi cells close over the dialog
  // state setters (setEditingMaterial / setDeletingMaterial / setDeleteError),
  // which are per-render closures — a module-level def cannot reference them.
  const columns: ColumnDef<RawMaterialResponse>[] = [
    {
      accessorKey: 'name',
      // Single search column with OR semantics: TanStack ANDs multiple column
      // filters, so a name search on `name`+`unit` would also have to match
      // `unit`. This filterFn keeps the original "name OR unit" behavior.
      filterFn: (row, _columnId, filterValue) => {
        const q = String(filterValue).toLowerCase();
        return (
          row.original.name.toLowerCase().includes(q) ||
          row.original.unit.toLowerCase().includes(q)
        );
      },
      header: ({ column }) => (
        <SortableHeader label="Nama Bahan Baku" column={column} />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'unit',
      header: ({ column }) => (
        <SortableHeader label="Satuan Stok" column={column} />
      ),
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="inline-flex rounded-xs bg-surface-muted px-2 py-0.5 text-xs text-text-secondary font-mono">
            {row.original.unit}
          </span>
          {/* The purchase form asks for THIS unit, so it belongs beside the
              stock unit rather than hidden in the edit dialog (ADR-024). */}
          <p
            data-testid={`rm-conversion-${row.original.id}`}
            className="text-[11px] text-text-tertiary font-mono"
          >
            1 {row.original.purchaseUnit} ={' '}
            {formatQuantity(row.original.conversionFactor, row.original.unit)}
          </p>
        </div>
      ),
    },
    {
      accessorFn: (row) => Number(row.unitCost),
      id: 'unitCost',
      header: ({ column }) => (
        <SortableHeader
          label="Biaya / Satuan Stok"
          column={column}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <span className="numeric font-mono text-text-primary">
          {formatCurrency(row.original.unitCost)}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => Number(row.currentStock),
      id: 'currentStock',
      header: ({ column }) => (
        <SortableHeader label="Stok Saat Ini" column={column} align="right" />
      ),
      cell: ({ row }) => {
        const currentStockNum = Number(row.original.currentStock);
        const thresholdNum = Number(row.original.lowStockThreshold);
        const isLowStock = thresholdNum > 0 && currentStockNum <= thresholdNum;
        const isOutOfStock = currentStockNum <= 0;

        return (
          <div className="flex items-center justify-end gap-2">
            <span className="numeric font-mono text-text-primary">
              {formatQuantity(row.original.currentStock, row.original.unit)}
            </span>
            {isOutOfStock ? (
              <Badge variant="danger" className="text-[10px] px-1.5 py-0">
                Habis
              </Badge>
            ) : isLowStock ? (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                Rendah
              </Badge>
            ) : null}
          </div>
        );
      },
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => Number(row.lowStockThreshold),
      id: 'lowStockThreshold',
      header: ({ column }) => (
        <SortableHeader label="Batas Rendah" column={column} align="right" />
      ),
      cell: ({ row }) => (
        <span className="numeric font-mono text-text-secondary text-xs">
          {formatQuantity(row.original.lowStockThreshold, row.original.unit)}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      header: 'Aksi',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Edit bahan baku"
            onClick={() => setEditingMaterial(row.original)}
            className="size-7 text-text-secondary hover:text-text-primary"
          >
            <Edit2 className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Hapus bahan baku"
            onClick={() => {
              setDeleteError(null);
              setDeletingMaterial(row.original);
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
    if (!deletingMaterial) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingMaterial.id);
      setDeletingMaterial(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Bahan baku tidak dapat dihapus karena sedang digunakan dalam resep atau transaksi.',
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
          Tambah Bahan Baku
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={materials}
        isLoading={isLoading}
        searchColumns={['name']}
        searchPlaceholder="Cari bahan baku atau satuan…"
        emptyMessage="Belum ada bahan baku terdaftar."
      />

      {/* Create / Edit Dialog */}
      <RawMaterialFormDialog
        open={isCreateOpen || Boolean(editingMaterial)}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingMaterial(null);
          }
        }}
        material={editingMaterial}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingMaterial)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingMaterial(null);
            setDeleteError(null);
          }
        }}
        title="Hapus Bahan Baku"
        description="Apakah Anda yakin ingin menghapus bahan baku ini? Tindakan ini tidak dapat dibatalkan."
        itemName={deletingMaterial?.name}
        isDeleting={deleteMutation.isPending}
        errorMessage={deleteError}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
