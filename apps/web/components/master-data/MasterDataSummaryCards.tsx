'use client';

import * as React from 'react';
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
} from '@ohmypos/api-contracts';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import { AlertTriangle, Coffee, Package, ShieldAlert } from 'lucide-react';

interface MasterDataSummaryCardsProps {
  products: ProductWithHppResponse[];
  rawMaterials: RawMaterialResponse[];
  isLoading?: boolean;
}

export function MasterDataSummaryCards({
  products,
  rawMaterials,
  isLoading = false,
}: MasterDataSummaryCardsProps) {
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.isActive).length;
  const productsWithoutRecipe = products.filter((p) => !p.hasRecipe).length;

  const totalRawMaterials = rawMaterials.length;
  const lowStockMaterials = rawMaterials.filter((rm) => {
    const stock = Number(rm.currentStock);
    const threshold = Number(rm.lowStockThreshold);
    return threshold > 0 && stock <= threshold;
  }).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Total Products */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Total Produk</p>
            <p className="mt-1 text-xl font-bold font-mono text-text-primary">
              {isLoading ? '—' : totalProducts}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {isLoading ? '…' : `${activeProducts} aktif dijual`}
            </p>
          </div>
          <div className="size-9 rounded-sm bg-brand-primary flex items-center justify-center text-white shadow-1">
            <Coffee className="size-5 text-white" />
          </div>
        </CardContent>
      </Card>

      {/* Total Raw Materials */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Total Bahan Baku</p>
            <p className="mt-1 text-xl font-bold font-mono text-text-primary">
              {isLoading ? '—' : totalRawMaterials}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              Sentralisasi pool bahan
            </p>
          </div>
          <div className="size-9 rounded-sm bg-brand-primary flex items-center justify-center text-white shadow-1">
            <Package className="size-5 text-white" />
          </div>
        </CardContent>
      </Card>

      {/* Products Without Recipe Warning */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Belum Ada Resep</p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                productsWithoutRecipe > 0
                  ? 'text-status-warning'
                  : 'text-text-primary'
              }`}
            >
              {isLoading ? '—' : productsWithoutRecipe}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {productsWithoutRecipe > 0
                ? 'HPP tidak dapat dihitung'
                : 'Semua produk beresep'}
            </p>
          </div>
          <div
            className={`size-9 rounded-sm flex items-center justify-center shadow-1 ${
              productsWithoutRecipe > 0
                ? 'bg-status-warning text-white'
                : 'bg-surface-muted text-text-tertiary'
            }`}
          >
            <AlertTriangle className="size-5" />
          </div>
        </CardContent>
      </Card>

      {/* Low Stock Warning */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Bahan Stok Rendah</p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                lowStockMaterials > 0
                  ? 'text-status-danger'
                  : 'text-text-primary'
              }`}
            >
              {isLoading ? '—' : lowStockMaterials}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {lowStockMaterials > 0
                ? 'Perlu pengadaan / restock'
                : 'Stok dalam batas aman'}
            </p>
          </div>
          <div
            className={`size-9 rounded-sm flex items-center justify-center shadow-1 ${
              lowStockMaterials > 0
                ? 'bg-status-danger text-white'
                : 'bg-surface-muted text-text-tertiary'
            }`}
          >
            <ShieldAlert className="size-5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
