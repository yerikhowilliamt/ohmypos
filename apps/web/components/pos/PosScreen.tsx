'use client';

import * as React from 'react';
import type {
  ProductWithHppResponse,
  SaleResponse,
  UserRole,
} from '@ohmypos/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
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

// ADR-014/015: the seeded central branch is an attribution-only ledger row,
// never a till — the backend rejects any Sale against it
// (`CentralBranchNotSellableException`, apps/api/src/modules/sales/sales.service.ts).
// Excluded from the OWNER branch picker so it can never be selected only to
// fail at submit.
const CENTRAL_BRANCH_NAME = 'Pusat (Dapur Sentral)';

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

  /**
   * KASIR always arrives with a fixed `branchId` (ADR-011 §2) — this state
   * just carries it through unchanged. OWNER arrives with `null` and picks
   * one via the header's `Select`; they can change it any time afterwards,
   * including with lines already in the cart, since `branchId` on `Sale` is
   * an attribution tag only (ADR-004) — stock/availability never depend on
   * which branch is selected.
   */
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | null>(
    branchId,
  );

  const sellableBranches = React.useMemo(
    () => (branches.data ?? []).filter((b) => b.name !== CENTRAL_BRANCH_NAME),
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
    // Only reachable for OWNER before they pick a branch — the grid/cart are
    // not even rendered in that state (see `needsBranchSelection` below), so
    // this is a defensive guard, not a real user-facing path.
    if (selectedBranchId === null) return;

    // The reducer, not this callback, is what makes a double tap unreachable:
    // SUBMIT_START is a no-op while a sale is already in flight.
    if (state.submit.status === 'pending') return;

    const mapped = toCreateSale({
      branchId: selectedBranchId,
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
    selectedBranchId,
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
            // OWNER hasn't picked a branch yet — nothing to browse or sell
            // against until they do (see `selectedBranchId` above).
            <p className="flex-1 py-8 text-center text-sm text-text-secondary">
              Pilih cabang untuk memulai transaksi.
            </p>
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
