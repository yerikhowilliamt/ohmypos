'use client';

import * as React from 'react';
import type { RawMaterialResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Input } from '@ohmypos/ui/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import { Badge } from '@ohmypos/ui/components/badge';
import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { formatCurrency, formatQuantity } from '@/lib/formatters';
import { useDeleteRawMaterial } from '@/hooks/useMasterData';
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
  const [search, setSearch] = React.useState('');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingMaterial, setEditingMaterial] =
    React.useState<RawMaterialResponse | null>(null);
  const [deletingMaterial, setDeletingMaterial] =
    React.useState<RawMaterialResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteRawMaterial();

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q),
    );
  }, [materials, search]);

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
      {/* Toolbar: Search + Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-text-tertiary" />
          <Input
            type="search"
            placeholder="Cari bahan baku atau satuan…"
            className="pl-9 bg-surface-raised"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0"
        >
          <Plus className="size-4" />
          Tambah Bahan Baku
        </Button>
      </div>

      {/* Table Container */}
      <div className="rounded-md border border-border-default bg-surface-raised shadow-1 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Nama Bahan Baku</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead className="text-right">Biaya Satuan</TableHead>
              <TableHead className="text-right">Stok Saat Ini</TableHead>
              <TableHead className="text-right">Batas Rendah</TableHead>
              <TableHead className="text-center w-[120px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-text-secondary"
                >
                  Memuat data bahan baku…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-text-secondary"
                >
                  {search
                    ? `Tidak ditemukan bahan baku yang cocok dengan "${search}"`
                    : 'Belum ada bahan baku terdaftar.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const currentStockNum = Number(item.currentStock);
                const thresholdNum = Number(item.lowStockThreshold);
                const isLowStock =
                  thresholdNum > 0 && currentStockNum <= thresholdNum;
                const isOutOfStock = currentStockNum <= 0;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-text-primary">
                      {item.name}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-xs bg-surface-muted px-2 py-0.5 text-xs text-text-secondary font-mono">
                        {item.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-right numeric font-mono text-text-primary">
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="numeric font-mono text-text-primary">
                          {formatQuantity(item.currentStock, item.unit)}
                        </span>
                        {isOutOfStock ? (
                          <Badge
                            variant="danger"
                            className="text-[10px] px-1.5 py-0"
                          >
                            Habis
                          </Badge>
                        ) : isLowStock ? (
                          <Badge
                            variant="warning"
                            className="text-[10px] px-1.5 py-0"
                          >
                            Rendah
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right numeric font-mono text-text-secondary text-xs">
                      {formatQuantity(item.lowStockThreshold, item.unit)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Edit bahan baku"
                          onClick={() => setEditingMaterial(item)}
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
                            setDeletingMaterial(item);
                          }}
                          className="size-7 text-status-danger hover:bg-status-danger/10"
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Hapus</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

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
