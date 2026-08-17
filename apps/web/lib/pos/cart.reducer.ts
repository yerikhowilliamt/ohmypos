/**
 * OhMyPos — POS cart state (PRD §5.2, Phase 8c plan §2 Option A).
 *
 * Pure: no React, no network, no dates. Every rule that decides whether the cart
 * is submittable, or what happens after a failed submit, lives here so it can be
 * tested exhaustively — the same shape as the backend's `stock.rules.ts` and
 * `sale-stock.calculator.ts`.
 */
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';

/**
 * Matches `CreateSaleSchema.items.max(50)`. Enforced client-side so the cashier
 * is stopped at the tile rather than by a 400 after they have built the order.
 */
export const MAX_CART_LINES = 50;

export interface CartLine {
  /** Stable client-side id. Two lines may share a `productId` — see `ADD_PRODUCT`. */
  id: string;
  productId: string;
  productName: string;
  /** The product's master price at the time the line was created. */
  masterPrice: string;
  /**
   * What the customer is actually charged. `null` means "charge master price" and
   * is what makes `to-create-sale.ts` omit `unitPrice` from the request entirely.
   */
  overridePrice: string | null;
  quantity: number;
}

export type SubmitStatus = 'idle' | 'pending' | 'error' | 'uncertain';

export interface CartError {
  kind:
    | 'INSUFFICIENT_STOCK'
    | 'STALE_PRODUCT'
    | 'FORBIDDEN'
    | 'INVALID'
    | 'UNCERTAIN'
    | 'UNKNOWN';
  message: string;
  /** Cart line ids implicated by the failure, for per-line highlighting. */
  lineIds: string[];
  shortfalls: {
    rawMaterialId: string;
    name: string;
    required: string;
    available: string;
  }[];
}

export interface CartState {
  lines: CartLine[];
  accountId: string | null;
  submit: { status: SubmitStatus; error: CartError | null };
}

export type CartAction =
  | { type: 'ADD_PRODUCT'; product: ProductWithHppResponse; lineId: string }
  | { type: 'INCREMENT'; lineId: string }
  | { type: 'DECREMENT'; lineId: string }
  | { type: 'SET_QUANTITY'; lineId: string; quantity: number }
  | { type: 'REMOVE_LINE'; lineId: string }
  | { type: 'SET_OVERRIDE_PRICE'; lineId: string; price: string | null }
  | { type: 'SELECT_ACCOUNT'; accountId: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_OK' }
  | { type: 'SUBMIT_FAIL'; error: CartError }
  | { type: 'DISMISS_ERROR' }
  | { type: 'CLEAR_CART' };

export const initialCartState: CartState = {
  lines: [],
  accountId: null,
  submit: { status: 'idle', error: null },
};

/**
 * Any edit to the cart invalidates a previous failure: the numbers the server
 * rejected are no longer the numbers on screen. Returning to `idle` is also what
 * re-arms `SUBMIT_START`.
 */
function afterEdit(state: CartState, lines: CartLine[]): CartState {
  return { ...state, lines, submit: { status: 'idle', error: null } };
}

function mapLine(
  state: CartState,
  lineId: string,
  fn: (line: CartLine) => CartLine,
): CartLine[] {
  return state.lines.map((line) => (line.id === lineId ? fn(line) : line));
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_PRODUCT': {
      /**
       * Merge into an existing line only when that line is still at master price.
       * A line carrying an override is a deliberate "this one is discounted"
       * decision, so tapping the tile again must start a fresh line rather than
       * silently sell another unit at the negotiated price. `CreateSaleSchema`
       * allows duplicate `productId` for exactly this reason (sale.schema.ts:30-37).
       */
      const mergeable = state.lines.find(
        (line) =>
          line.productId === action.product.id && line.overridePrice === null,
      );

      if (mergeable) {
        return afterEdit(
          state,
          mapLine(state, mergeable.id, (line) => ({
            ...line,
            quantity: line.quantity + 1,
          })),
        );
      }

      if (state.lines.length >= MAX_CART_LINES) return state;

      return afterEdit(state, [
        ...state.lines,
        {
          id: action.lineId,
          productId: action.product.id,
          productName: action.product.name,
          masterPrice: action.product.sellPrice,
          overridePrice: null,
          quantity: 1,
        },
      ]);
    }

    case 'INCREMENT':
      return afterEdit(
        state,
        mapLine(state, action.lineId, (line) => ({
          ...line,
          quantity: line.quantity + 1,
        })),
      );

    case 'DECREMENT': {
      const target = state.lines.find((line) => line.id === action.lineId);
      if (!target) return state;
      // Decrementing the last unit removes the line — DESIGN.md §25 lists
      // "remove item" as a quantity control, not a separate destructive action.
      if (target.quantity <= 1) {
        return afterEdit(
          state,
          state.lines.filter((line) => line.id !== action.lineId),
        );
      }
      return afterEdit(
        state,
        mapLine(state, action.lineId, (line) => ({
          ...line,
          quantity: line.quantity - 1,
        })),
      );
    }

    case 'SET_QUANTITY': {
      if (!Number.isInteger(action.quantity) || action.quantity < 1) {
        // `SaleItemInputSchema.quantity` refines `> 0`; a zero-quantity line
        // would be rejected server-side, so it is never allowed into state.
        return state;
      }
      return afterEdit(
        state,
        mapLine(state, action.lineId, (line) => ({
          ...line,
          quantity: action.quantity,
        })),
      );
    }

    case 'REMOVE_LINE':
      return afterEdit(
        state,
        state.lines.filter((line) => line.id !== action.lineId),
      );

    case 'SET_OVERRIDE_PRICE':
      return afterEdit(
        state,
        mapLine(state, action.lineId, (line) => ({
          ...line,
          // An empty input clears the override rather than sending "0" — DEBT-009
          // leaves overrides unrestricted, but an accidental free item is a
          // different thing from a deliberate one.
          overridePrice:
            action.price === null || action.price === '' ? null : action.price,
        })),
      );

    case 'SELECT_ACCOUNT':
      return {
        ...state,
        accountId: action.accountId,
        submit: { status: 'idle', error: null },
      };

    case 'SUBMIT_START':
      // The guard against double-submit. A second dispatch while a sale is in
      // flight is dropped here, so it cannot depend on a button's disabled state
      // winning a race with a double tap.
      if (state.submit.status === 'pending') return state;
      return { ...state, submit: { status: 'pending', error: null } };

    case 'SUBMIT_OK':
      // The ONLY action that clears the cart. Every failure path below leaves
      // lines, quantities and overrides byte-identical so retry is one tap.
      return { ...initialCartState, accountId: state.accountId };

    case 'SUBMIT_FAIL':
      return {
        ...state,
        submit: {
          status: action.error.kind === 'UNCERTAIN' ? 'uncertain' : 'error',
          error: action.error,
        },
      };

    case 'DISMISS_ERROR':
      // An uncertain submit is not dismissible: the cashier must confirm whether
      // the sale landed before the cart is usable again (plan §5).
      if (state.submit.status === 'uncertain') return state;
      return { ...state, submit: { status: 'idle', error: null } };

    case 'CLEAR_CART':
      return { ...initialCartState, accountId: state.accountId };

    default:
      return state;
  }
}

/** The cart is submittable only when it has lines, a payment method, and is idle. */
export function canSubmit(state: CartState): boolean {
  return (
    state.lines.length > 0 &&
    state.accountId !== null &&
    state.submit.status !== 'pending' &&
    state.submit.status !== 'uncertain'
  );
}

/** The price actually charged for a line. */
export function effectiveUnitPrice(line: CartLine): string {
  return line.overridePrice ?? line.masterPrice;
}
