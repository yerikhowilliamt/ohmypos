'use client';

import * as React from 'react';
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
} from '@ohmypos/api-contracts';
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
import { ChefHat, Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { formatCurrency, formatMarginPercentage } from '@/lib/formatters';
import { useDeleteProduct } from '@/hooks/useMasterData';
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
  const [search, setSearch] = React.useState('');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] =
    React.useState<ProductWithHppResponse | null>(null);
  const [recipeProduct, setRecipeProduct] =
    React.useState<ProductWithHppResponse | null>(null);
  const [deletingProduct, setDeletingProduct] =
    React.useState<ProductWithHppResponse | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const deleteMutation = useDeleteProduct();

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

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
      {/* Toolbar: Search + Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-text-tertiary" />
          <Input
            type="search"
            placeholder="Cari nama produk / menu…"
            className="pl-9 bg-surface-raised w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 w-full sm:w-auto justify-center"
        >
          <Plus className="size-4" />
          Tambah Produk
        </Button>
      </div>

      {/* Table Container */}
      <div className="rounded-md border border-border-default bg-surface-raised shadow-1 overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[780px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Nama Produk</TableHead>
                <TableHead className="text-right min-w-[120px]">
                  Harga Jual
                </TableHead>
                <TableHead className="text-right min-w-[120px]">
                  Live HPP
                </TableHead>
                <TableHead className="text-right min-w-[100px]">
                  Margin
                </TableHead>
                <TableHead className="text-center min-w-[130px]">
                  Dapat Dibuat
                </TableHead>
                <TableHead className="text-center min-w-[100px]">
                  Status
                </TableHead>
                <TableHead className="text-center min-w-[120px]">
                  Aksi
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-text-secondary"
                  >
                    Memuat data produk…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-text-secondary"
                  >
                    {search
                      ? `Tidak ditemukan produk yang cocok dengan "${search}"`
                      : 'Belum ada produk terdaftar.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((product) => {
                  const marginFormatted = formatMarginPercentage(
                    product.sellPrice,
                    product.hpp,
                  );

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-text-primary">
                            {product.name}
                          </span>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {product.hasRecipe ? (
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
                      </TableCell>

                      <TableCell className="text-right numeric font-mono font-medium text-text-primary">
                        {formatCurrency(product.sellPrice)}
                      </TableCell>

                      <TableCell className="text-right">
                        {product.hpp ? (
                          <span className="numeric font-mono text-text-primary">
                            {formatCurrency(product.hpp)}
                          </span>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {marginFormatted ? (
                          <span className="numeric font-mono font-medium text-accent-inflow">
                            {marginFormatted}
                          </span>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {product.makeableQuantity !== null ? (
                          <span className="numeric font-mono text-xs font-medium text-text-secondary bg-surface-muted px-2 py-0.5 rounded-xs">
                            {product.makeableQuantity} porsi
                          </span>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {product.isActive ? (
                          <Badge variant="success" className="text-[11px]">
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">
                            Nonaktif
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Kelola resep (BOM)"
                            onClick={() => setRecipeProduct(product)}
                            className="size-7 text-accent-outflow hover:bg-surface-strong"
                          >
                            <ChefHat className="size-3.5" />
                            <span className="sr-only">Edit Resep</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Edit produk"
                            onClick={() => setEditingProduct(product)}
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
                              setDeletingProduct(product);
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
      </div>

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
