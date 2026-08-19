'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useProducts, useRawMaterials } from '@/hooks/useMasterData';
import { MasterDataSummaryCards } from '@/components/master-data/MasterDataSummaryCards';
import { ProductsTable } from '@/components/master-data/ProductsTable';
import { RawMaterialsTable } from '@/components/master-data/RawMaterialsTable';

interface MasterDataClientProps {
  initialTab?: 'products' | 'raw-materials';
}

export function MasterDataClient({
  initialTab = 'products',
}: MasterDataClientProps) {
  const pathname = usePathname();
  const isRawMaterials =
    pathname.includes('/raw-materials') || initialTab === 'raw-materials';

  const { data: products = [], isLoading: isProductsLoading } = useProducts();

  const { data: rawMaterials = [], isLoading: isRawMaterialsLoading } =
    useRawMaterials();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {isRawMaterials ? 'Bahan Baku' : 'Produk & Resep'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {isRawMaterials
            ? 'Kelola inventaris dan harga beli bahan baku.'
            : 'Kelola katalog menu produk dan takaran resep / komposisi (BOM).'}
        </p>
      </div>

      {/* Summary KPI Cards */}
      <MasterDataSummaryCards
        products={products}
        rawMaterials={rawMaterials}
        isLoading={isProductsLoading || isRawMaterialsLoading}
      />

      {!isRawMaterials ? (
        <ProductsTable
          products={products}
          rawMaterials={rawMaterials}
          isLoading={isProductsLoading}
        />
      ) : (
        <RawMaterialsTable
          materials={rawMaterials}
          isLoading={isRawMaterialsLoading}
        />
      )}
    </div>
  );
}
