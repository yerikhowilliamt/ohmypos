'use client';

import * as React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ohmypos/ui/components/tabs';
import { useProducts, useRawMaterials } from '@/hooks/useMasterData';
import { MasterDataSummaryCards } from '@/components/master-data/MasterDataSummaryCards';
import { ProductsTable } from '@/components/master-data/ProductsTable';
import { RawMaterialsTable } from '@/components/master-data/RawMaterialsTable';
import { Coffee, Package } from 'lucide-react';

export function MasterDataClient() {
  const [activeTab, setActiveTab] = React.useState('products');

  const { data: products = [], isLoading: isProductsLoading } = useProducts();

  const { data: rawMaterials = [], isLoading: isRawMaterialsLoading } =
    useRawMaterials();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Data Master
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola katalog menu produk, takaran resep / komposisi (BOM), dan
          inventaris bahan baku.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <MasterDataSummaryCards
        products={products}
        rawMaterials={rawMaterials}
        isLoading={isProductsLoading || isRawMaterialsLoading}
      />

      {/* Segmented Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="products" className="gap-2">
            <Coffee className="size-4" />
            Produk & Resep ({products.length})
          </TabsTrigger>
          <TabsTrigger value="raw-materials" className="gap-2">
            <Package className="size-4" />
            Bahan Baku ({rawMaterials.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-0">
          <ProductsTable
            products={products}
            rawMaterials={rawMaterials}
            isLoading={isProductsLoading}
          />
        </TabsContent>

        <TabsContent value="raw-materials" className="mt-0">
          <RawMaterialsTable
            materials={rawMaterials}
            isLoading={isRawMaterialsLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
