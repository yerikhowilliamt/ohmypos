'use client';

import * as React from 'react';
import type {
  ProductWithHppResponse,
  SaleResponse,
  UserRole,
} from '@ohmypos/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  MASTER_DATA_QUERY_KEYS,
  useProducts,
  useRawMaterials,
} from '@/hooks/useMasterData';
import {
  useCreateSale,
  usePaymentMethods,
  useRecentSales,
} from '@/hooks/usePos';
import { computeCartAvailability } from '@/lib/pos/availability';
import { mapSubmitError } from '@/lib/pos/submit-error';
import { toCreateSale } from '@/lib/pos/to-create-sale';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@ohmypos/ui/components/button';
import { formatCurrency } from '@/lib/formatters';
import { cartItemCount, cartTotal } from '@/lib/pos/cart-totals';
import {
  countByBucket,
  filterProducts,
  type ProductBucket,
} from '@/lib/pos/product-filters';
import { CartProvider, useCart } from './CartProvider';
import { CartPanel } from './CartPanel';
import { CategoryFilterRow } from './CategoryFilterRow';
import { PosPageHeader } from './PosPageHeader';
import { ProductGrid } from './ProductGrid';
import { SaleSuccessDialog } from './SaleSuccessDialog';

export function PosScreen({
  branchId,
  role,
}: {
  branchId: string;
  role: UserRole;
}) {
  return (
    <CartProvider>
      <PosScreenInner branchId={branchId} role={role} />
    </CartProvider>
  );
}

function PosScreenInner({
  branchId,
  role,
}: {
  branchId: string;
  role: UserRole;
}) {
  const { state, dispatch } = useCart();
  const queryClient = useQueryClient();

  const products = useProducts();
  const rawMaterials = useRawMaterials();
  const paymentMethods = usePaymentMethods();
  const recentSales = useRecentSales();
  const createSale = useCreateSale();

  const [completedSale, setCompletedSale] = React.useState<SaleResponse | null>(
    null,
  );

  const productList = React.useMemo(() => products.data ?? [], [products.data]);
  const materialList = React.useMemo(
    () => rawMaterials.data ?? [],
    [rawMaterials.data],
  );

  /**
   * The cart-aware makeable quantity. Recomputed on every cart mutation and on
   * every refetch of stock — it is derived state, never stored, so it can never
   * disagree with the lines on screen.
   */
  const availability = React.useMemo(
    () =>
      computeCartAvailability({
        products: productList,
        rawMaterials: materialList,
        lines: state.lines,
      }),
    [productList, materialList, state.lines],
  );

  const inCartQuantities = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of state.lines) {
      counts.set(
        line.productId,
        (counts.get(line.productId) ?? 0) + line.quantity,
      );
    }
    return counts;
  }, [state.lines]);

  /**
   * §24.1 wants a thumbnail per order row, but `CartLine` carries only the
   * name and prices (cart.reducer.ts) — deliberately, so the cart never holds
   * a stale copy of product data. Resolving the photo here, from the same list
   * the grid renders, keeps the reducer untouched.
   */
  const productPhotos = React.useMemo(() => {
    const photos = new Map<string, string | null>();
    for (const product of productList) {
      photos.set(product.id, product.photoUrl ?? null);
    }
    return photos;
  }, [productList]);

  const [query, setQuery] = React.useState('');
  const [bucket, setBucket] = React.useState<ProductBucket>('ALL');
  /** DESIGN.md §21's active state — the most recently added product. */
  const [highlightedProductId, setHighlightedProductId] = React.useState<
    string | null
  >(null);

  const bucketCounts = React.useMemo(
    () => countByBucket(productList, availability.headroom),
    [productList, availability.headroom],
  );

  const visibleProducts = React.useMemo(
    () =>
      filterProducts({
        products: productList,
        headroom: availability.headroom,
        bucket,
        query,
      }),
    [productList, availability.headroom, bucket, query],
  );

  // ADR-011: only ADMIN/OWNER can reach /master-data, so only they see §21.1's
  // Add New Product card. A KASIR tapping it would land on a 403.
  const canCreateProducts = role === 'OWNER' || role === 'ADMIN';

  const handleAdd = React.useCallback(
    (product: ProductWithHppResponse) => {
      setHighlightedProductId(product.id);
      dispatch({
        type: 'ADD_PRODUCT',
        product,
        lineId: crypto.randomUUID(),
      });
    },
    [dispatch],
  );

  const handleSubmit = React.useCallback(() => {
    if (state.accountId === null) return;

    // The reducer, not this callback, is what makes a double tap unreachable:
    // SUBMIT_START is a no-op while a sale is already in flight.
    if (state.submit.status === 'pending') return;

    const mapped = toCreateSale({
      branchId,
      accountId: state.accountId,
      lines: state.lines,
      // Taken at submit, not at cart open: CreateSaleSchema rejects a soldAt more
      // than five minutes ahead, and a cart can sit open longer than that.
      soldAt: new Date(),
    });

    if (!mapped.ok) {
      dispatch({
        type: 'SUBMIT_FAIL',
        error: {
          kind: 'INVALID',
          message: `Data penjualan tidak valid — ${mapped.error}`,
          lineIds: [],
          shortfalls: [],
        },
      });
      return;
    }

    dispatch({ type: 'SUBMIT_START' });

    createSale.mutate(mapped.value, {
      onSuccess: (sale) => {
        setCompletedSale(sale);
        // The only path that clears the cart.
        dispatch({ type: 'SUBMIT_OK' });
      },
      onError: (error) => {
        const cartError = mapSubmitError({
          error,
          lines: state.lines,
          products: productList,
        });

        // Refresh whatever the failure proves is stale, so the advisory numbers
        // re-render against current truth before the cashier retries.
        if (cartError.kind === 'INSUFFICIENT_STOCK') {
          queryClient.invalidateQueries({
            queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
          });
        }
        if (cartError.kind === 'STALE_PRODUCT') {
          queryClient.invalidateQueries({
            queryKey: MASTER_DATA_QUERY_KEYS.products,
          });
        }

        dispatch({ type: 'SUBMIT_FAIL', error: cartError });
      },
    });
  }, [
    branchId,
    createSale,
    dispatch,
    productList,
    queryClient,
    state.accountId,
    state.lines,
    state.submit.status,
  ]);

  const errorMessage = (error: unknown): string | null =>
    error instanceof Error ? error.message : null;

  const cartSum = React.useMemo(() => cartTotal(state.lines), [state.lines]);
  const cartCount = React.useMemo(
    () => cartItemCount(state.lines),
    [state.lines],
  );

  return (
    <>
      <div className="flex flex-col gap-4 pb-16 lg:h-full lg:min-h-0 lg:flex-row lg:items-stretch lg:pb-0">
        {/* Zone 2 — Product Discovery (§20). The fixed-height, internally-
            scrolling three-zone layout is a desktop (lg+) affordance only —
            below lg the panels stack and the page scrolls normally via
            AppShell's <main>, same as CartPanel's own shrink-0 sizing
            already assumes. Forcing h-full/flex-1/overflow-y-auto below lg
            starved this section against CartPanel's natural mobile height. */}
        <section
          aria-label="Pilih produk"
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-border-default bg-surface-raised p-4 shadow-1 lg:min-h-0 lg:flex-1"
        >
          <PosPageHeader query={query} onQueryChange={setQuery} />

          <CategoryFilterRow
            buckets={bucketCounts}
            selected={bucket}
            onSelect={setBucket}
          />

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <ProductGrid
              products={visibleProducts}
              headroom={availability.headroom}
              inCartQuantities={inCartQuantities}
              highlightedProductId={highlightedProductId}
              canCreateProducts={canCreateProducts}
              isLoading={products.isLoading}
              error={errorMessage(products.error)}
              isFiltered={query.trim().length > 0 || bucket !== 'ALL'}
              onAdd={handleAdd}
            />
          </div>
        </section>

        {/* Zone 3 — persistent order context (§20). Its internals are Phase 3. */}
        <CartPanel
          state={state}
          overCommittedLineIds={availability.overCommittedLineIds}
          productPhotos={productPhotos}
          paymentMethods={paymentMethods.data ?? []}
          paymentMethodsLoading={paymentMethods.isLoading}
          paymentMethodsError={errorMessage(paymentMethods.error)}
          recentSales={recentSales.data}
          isCheckingRecent={recentSales.isFetching}
          onIncrement={(lineId) => dispatch({ type: 'INCREMENT', lineId })}
          onDecrement={(lineId) => dispatch({ type: 'DECREMENT', lineId })}
          onRemove={(lineId) => dispatch({ type: 'REMOVE_LINE', lineId })}
          onPriceChange={(lineId, price) =>
            dispatch({ type: 'SET_OVERRIDE_PRICE', lineId, price })
          }
          onSelectAccount={(accountId) =>
            dispatch({ type: 'SELECT_ACCOUNT', accountId })
          }
          onSubmit={handleSubmit}
          onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
          onCheckRecent={() => void recentSales.refetch()}
          onClearCart={() => dispatch({ type: 'CLEAR_CART' })}
        />
      </div>

      {/* Floating sticky cart bar on mobile screens (< lg) */}
      {state.lines.length > 0 && (
        <div className="fixed bottom-3 left-3 right-3 z-30 flex items-center justify-between rounded-md border border-border-default bg-surface-raised/95 p-3 shadow-2 backdrop-blur-xs lg:hidden animate-in slide-in-from-bottom duration-200">
          <div className="flex flex-col">
            <span className="text-xs text-text-secondary">
              {cartCount} item dipilih
            </span>
            <span className="numeric font-mono text-base font-bold text-text-primary">
              {formatCurrency(cartSum)}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const cartEl = document.getElementById('pos-cart-panel');
              cartEl?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="gap-1.5 shadow-1"
          >
            <ShoppingBag className="size-4" />
            Lihat Pesanan
          </Button>
        </div>
      )}

      <SaleSuccessDialog
        sale={completedSale}
        onClose={() => setCompletedSale(null)}
      />
    </>
  );
}
