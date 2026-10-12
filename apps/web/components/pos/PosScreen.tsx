'use client';

import * as React from 'react';
import type {
  ProductWithHppResponse,
  SaleResponse,
  UserRole,
} from '@ohmypos/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
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
import { useBranches } from '@/hooks/useBranches';
import { computeCartAvailability } from '@/lib/pos/availability';
import { mapSubmitError } from '@/lib/pos/submit-error';
import { toCreateSale } from '@/lib/pos/to-create-sale';
import { cartItemCount, cartTotal } from '@/lib/pos/cart-totals';
import {
  countByBucket,
  filterProducts,
  type ProductBucket,
} from '@/lib/pos/product-filters';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { CartProvider, useCart } from './CartProvider';
import { CartPanel } from './CartPanel';
import { CategoryFilterRow } from './CategoryFilterRow';
import { PosOrderSheet } from './PosOrderSheet';
import { PosPageHeader } from './PosPageHeader';
import { ProductGrid } from './ProductGrid';
import { SaleSuccessDialog } from './SaleSuccessDialog';

// The system branch is not a till (ADR-014); hidden from the OWNER branch picker.

export function PosScreen({
  branchId,
  role,
}: {
  branchId: string | null;
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
  branchId: string | null;
  role: UserRole;
}) {
  const { state, dispatch } = useCart();
  const queryClient = useQueryClient();

  const products = useProducts();
  const rawMaterials = useRawMaterials();
  const paymentMethods = usePaymentMethods();
  const recentSales = useRecentSales();
  const createSale = useCreateSale();
  const branches = useBranches();

  const [completedSale, setCompletedSale] = React.useState<SaleResponse | null>(
    null,
  );
  const [saleIdempotencyKey, setSaleIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );

  const productList = React.useMemo(() => products.data ?? [], [products.data]);
  const materialList = React.useMemo(
    () => rawMaterials.data ?? [],
    [rawMaterials.data],
  );

  /** Cart-aware makeable quantity, derived on every cart change and stock refetch. */
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

  /** Cart row thumbnails resolved from the product list; the cart holds no product copies. */
  const productPhotos = React.useMemo(() => {
    const photos = new Map<string, string | null>();
    for (const product of productList) {
      photos.set(product.id, product.photoUrl ?? null);
    }
    return photos;
  }, [productList]);

  const [query, setQuery] = React.useState('');
  const [bucket, setBucket] = React.useState<ProductBucket>('ALL');
  /** The most recently added product (DESIGN.md §11.2 active state). */
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

  // Only ADMIN/OWNER see "Add New Product"; KASIR cannot reach master data.
  const canCreateProducts = role === 'OWNER' || role === 'ADMIN';

  /** KASIR has a fixed branch; OWNER picks one. Branch is attribution only (ADR-004). */
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | null>(
    branchId,
  );

  // The system location is a ledger scope, not a till (ADR-014/ADR-015).
  const sellableBranches = React.useMemo(
    () => (branches.data ?? []).filter((b) => !b.isSystem),
    [branches.data],
  );

  const needsBranchSelection = role === 'OWNER' && selectedBranchId === null;

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
    // Defensive: OWNER without a branch never sees the cart.
    if (selectedBranchId === null) return;

    // The reducer makes a double tap a no-op.
    if (state.submit.status === 'pending') return;

    const mapped = toCreateSale({
      branchId: selectedBranchId,
      accountId: state.accountId,
      lines: state.lines,
      // Taken at submit: the API rejects soldAt more than 5 minutes ahead.
      soldAt: new Date(),
      idempotencyKey: saleIdempotencyKey,
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
        setSaleIdempotencyKey(crypto.randomUUID());
        // The only path that clears the cart.
        dispatch({ type: 'SUBMIT_OK' });
      },
      onError: (error) => {
        const cartError = mapSubmitError({
          error,
          lines: state.lines,
          products: productList,
        });

        // Refetch whatever the failure shows is stale before the retry.
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
    selectedBranchId,
    createSale,
    dispatch,
    productList,
    queryClient,
    state.accountId,
    state.lines,
    state.submit.status,
    saleIdempotencyKey,
  ]);

  const errorMessage = (error: unknown): string | null =>
    error instanceof Error ? error.message : null;

  const cartSum = React.useMemo(() => cartTotal(state.lines), [state.lines]);
  const cartCount = React.useMemo(
    () => cartItemCount(state.lines),
    [state.lines],
  );

  // §41.3: below 768px the panel lives in a bottom sheet instead of the flow.
  const isMobile = useIsMobile();

  const branchPicker =
    role === 'OWNER' ? (
      <Select
        value={selectedBranchId ?? undefined}
        onValueChange={setSelectedBranchId}
      >
        <SelectTrigger
          id="pos-branch"
          aria-label="Cabang"
          className="h-8 w-full text-sm sm:w-56"
        >
          <SelectValue placeholder="Pilih cabang" />
        </SelectTrigger>
        <SelectContent>
          {sellableBranches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : undefined;

  const cartPanel = (
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
  );

  return (
    <>
      {/* §41.1: md = 768px is the mobile/tablet line. Tablet keeps both zones
          side by side (§41.3); only below 768px does the panel leave the flow
          for the bottom sheet. */}
      <div className="flex flex-col gap-4 md:h-full md:min-h-0 md:flex-row md:items-stretch">
        {/* Zone 2 — Product Discovery (§20). The fixed-height, internally-
            scrolling three-zone layout is a tablet+ (md+) affordance — below
            md the panels stack and the page scrolls normally via AppShell's
            <main>, same as CartPanel's own shrink-0 sizing already assumes.
            Forcing h-full/flex-1/overflow-y-auto below md starved this
            section against CartPanel's natural mobile height. */}
        <section
          aria-label="Pilih produk"
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-border-default bg-surface-raised p-4 shadow-1 md:min-h-0 md:flex-1"
        >
          <PosPageHeader
            query={query}
            onQueryChange={setQuery}
            branchPicker={branchPicker}
          />

          {needsBranchSelection ? (
            // OWNER has not picked a branch yet.
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-text-tertiary"
              >
                <Store className="size-5" />
              </span>
              <p className="text-sm text-text-secondary">
                Pilih cabang untuk memulai transaksi.
              </p>
            </div>
          ) : (
            <>
              <CategoryFilterRow
                buckets={bucketCounts}
                selected={bucket}
                onSelect={setBucket}
              />

              <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
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
            </>
          )}
        </section>

        {/* Zone 3 — persistent order context (§20). At <768px it moves into a
            bottom sheet (§41.3) rather than stacking under the grid. Hidden
            entirely while OWNER hasn't picked a branch — no cart to show. */}
        {!needsBranchSelection && !isMobile && cartPanel}
      </div>

      {!needsBranchSelection && isMobile && (
        <PosOrderSheet itemCount={cartCount} total={cartSum}>
          {cartPanel}
        </PosOrderSheet>
      )}

      <SaleSuccessDialog
        sale={completedSale}
        onClose={() => setCompletedSale(null)}
      />
    </>
  );
}
