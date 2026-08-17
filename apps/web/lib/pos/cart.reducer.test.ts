import { describe, expect, it } from 'vitest';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import {
  canSubmit,
  cartReducer,
  effectiveUnitPrice,
  initialCartState,
  MAX_CART_LINES,
  type CartError,
  type CartState,
} from './cart.reducer';

const PRODUCT_A: ProductWithHppResponse = {
  id: 'pppppppp-1111-4111-8111-111111111111',
  name: 'Es Kopi Susu',
  sellPrice: '20000.00',
  isActive: true,
  hpp: '8000.00',
  hasRecipe: true,
  margin: '12000.00',
  makeableQuantity: 40,
  recipeItems: [
    {
      rawMaterialId: 'aaaaaaaa-1111-4111-8111-111111111111',
      quantityUsed: '1.0000',
    },
  ],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

const PRODUCT_B: ProductWithHppResponse = {
  ...PRODUCT_A,
  id: 'pppppppp-2222-4222-8222-222222222222',
  name: 'Latte',
  sellPrice: '25000.00',
};

function add(state: CartState, product = PRODUCT_A, lineId = 'l1'): CartState {
  return cartReducer(state, { type: 'ADD_PRODUCT', product, lineId });
}

const anError: CartError = {
  kind: 'INSUFFICIENT_STOCK',
  message: 'Stok tidak cukup',
  lineIds: ['l1'],
  shortfalls: [],
};

describe('ADD_PRODUCT', () => {
  it('creates a line at the product master price', () => {
    const state = add(initialCartState);
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({
      id: 'l1',
      productId: PRODUCT_A.id,
      productName: 'Es Kopi Susu',
      masterPrice: '20000.00',
      overridePrice: null,
      quantity: 1,
    });
  });

  it('increments an existing line rather than duplicating it', () => {
    const state = add(add(initialCartState), PRODUCT_A, 'l2');
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.quantity).toBe(2);
  });

  it('starts a NEW line when the existing one carries a price override', () => {
    // The same product may legitimately appear twice at two prices — one at menu
    // price, one negotiated (sale.schema.ts:30-37). Merging would silently sell
    // another unit at the discounted price.
    let state = add(initialCartState);
    state = cartReducer(state, {
      type: 'SET_OVERRIDE_PRICE',
      lineId: 'l1',
      price: '15000.00',
    });
    state = add(state, PRODUCT_A, 'l2');

    expect(state.lines).toHaveLength(2);
    expect(state.lines[0]?.overridePrice).toBe('15000.00');
    expect(state.lines[1]?.overridePrice).toBeNull();
    expect(state.lines[1]?.quantity).toBe(1);
  });

  it('keeps different products on separate lines', () => {
    const state = add(add(initialCartState), PRODUCT_B, 'l2');
    expect(state.lines).toHaveLength(2);
  });

  it('refuses to exceed the 50-line cap that CreateSaleSchema enforces', () => {
    let state = initialCartState;
    for (let i = 0; i < MAX_CART_LINES; i += 1) {
      state = add(state, { ...PRODUCT_A, id: `p-${i}` }, `l-${i}`);
    }
    expect(state.lines).toHaveLength(MAX_CART_LINES);

    const overflowed = add(
      state,
      { ...PRODUCT_A, id: 'p-overflow' },
      'l-overflow',
    );
    expect(overflowed.lines).toHaveLength(MAX_CART_LINES);
    expect(overflowed).toBe(state);
  });
});

describe('quantity controls', () => {
  it('increments and decrements', () => {
    let state = add(initialCartState);
    state = cartReducer(state, { type: 'INCREMENT', lineId: 'l1' });
    expect(state.lines[0]?.quantity).toBe(2);
    state = cartReducer(state, { type: 'DECREMENT', lineId: 'l1' });
    expect(state.lines[0]?.quantity).toBe(1);
  });

  it('removes the line when the last unit is decremented', () => {
    const state = cartReducer(add(initialCartState), {
      type: 'DECREMENT',
      lineId: 'l1',
    });
    expect(state.lines).toHaveLength(0);
  });

  it('rejects a non-positive SET_QUANTITY, which the API would reject too', () => {
    const state = add(initialCartState);
    expect(
      cartReducer(state, { type: 'SET_QUANTITY', lineId: 'l1', quantity: 0 }),
    ).toBe(state);
    expect(
      cartReducer(state, { type: 'SET_QUANTITY', lineId: 'l1', quantity: -3 }),
    ).toBe(state);
    expect(
      cartReducer(state, { type: 'SET_QUANTITY', lineId: 'l1', quantity: 1.5 }),
    ).toBe(state);
  });

  it('removes a line outright', () => {
    const state = cartReducer(add(initialCartState), {
      type: 'REMOVE_LINE',
      lineId: 'l1',
    });
    expect(state.lines).toHaveLength(0);
  });
});

describe('price override', () => {
  it('sets and reports the effective unit price', () => {
    let state = add(initialCartState);
    expect(effectiveUnitPrice(state.lines[0]!)).toBe('20000.00');

    state = cartReducer(state, {
      type: 'SET_OVERRIDE_PRICE',
      lineId: 'l1',
      price: '15000',
    });
    expect(state.lines[0]?.overridePrice).toBe('15000');
    expect(effectiveUnitPrice(state.lines[0]!)).toBe('15000');
  });

  it('treats an emptied field as clearing the override, not as a zero price', () => {
    let state = add(initialCartState);
    state = cartReducer(state, {
      type: 'SET_OVERRIDE_PRICE',
      lineId: 'l1',
      price: '15000',
    });
    state = cartReducer(state, {
      type: 'SET_OVERRIDE_PRICE',
      lineId: 'l1',
      price: '',
    });
    expect(state.lines[0]?.overridePrice).toBeNull();
    expect(effectiveUnitPrice(state.lines[0]!)).toBe('20000.00');
  });
});

describe('submit lifecycle', () => {
  it('SUBMIT_START is a no-op while a submit is already pending', () => {
    // This, not a disabled button, is what makes double-submit unreachable.
    const pending = cartReducer(add(initialCartState), {
      type: 'SUBMIT_START',
    });
    expect(pending.submit.status).toBe('pending');
    expect(cartReducer(pending, { type: 'SUBMIT_START' })).toBe(pending);
  });

  it('SUBMIT_FAIL leaves lines, quantities and overrides byte-identical', () => {
    let state = add(initialCartState);
    state = cartReducer(state, { type: 'INCREMENT', lineId: 'l1' });
    state = cartReducer(state, {
      type: 'SET_OVERRIDE_PRICE',
      lineId: 'l1',
      price: '15000',
    });
    const before = state.lines;

    state = cartReducer(state, { type: 'SUBMIT_START' });
    state = cartReducer(state, { type: 'SUBMIT_FAIL', error: anError });

    expect(state.submit.status).toBe('error');
    expect(state.submit.error).toEqual(anError);
    expect(state.lines).toEqual(before);
  });

  it('marks an uncertain failure distinctly so retry stays blocked', () => {
    let state = cartReducer(add(initialCartState), { type: 'SUBMIT_START' });
    state = cartReducer(state, {
      type: 'SUBMIT_FAIL',
      error: { ...anError, kind: 'UNCERTAIN' },
    });

    expect(state.submit.status).toBe('uncertain');
    expect(canSubmit(state)).toBe(false);
    // An uncertain result cannot simply be dismissed away.
    expect(cartReducer(state, { type: 'DISMISS_ERROR' })).toBe(state);
  });

  it('SUBMIT_OK is the only action that clears the cart, and keeps the account', () => {
    let state = add(initialCartState);
    state = cartReducer(state, {
      type: 'SELECT_ACCOUNT',
      accountId: 'acc-1',
    });
    state = cartReducer(state, { type: 'SUBMIT_START' });
    state = cartReducer(state, { type: 'SUBMIT_OK' });

    expect(state.lines).toHaveLength(0);
    expect(state.submit).toEqual({ status: 'idle', error: null });
    // The next customer usually pays the same way; re-picking every time is friction.
    expect(state.accountId).toBe('acc-1');
  });

  it('clears a previous error as soon as the cart is edited', () => {
    let state = add(initialCartState);
    state = cartReducer(state, { type: 'SUBMIT_START' });
    state = cartReducer(state, { type: 'SUBMIT_FAIL', error: anError });
    expect(state.submit.status).toBe('error');

    state = cartReducer(state, { type: 'DECREMENT', lineId: 'l1' });
    expect(state.submit).toEqual({ status: 'idle', error: null });
  });
});

describe('canSubmit', () => {
  it('requires lines and a payment method', () => {
    expect(canSubmit(initialCartState)).toBe(false);

    const withLines = add(initialCartState);
    expect(canSubmit(withLines)).toBe(false);

    const ready = cartReducer(withLines, {
      type: 'SELECT_ACCOUNT',
      accountId: 'acc-1',
    });
    expect(canSubmit(ready)).toBe(true);

    expect(canSubmit(cartReducer(ready, { type: 'SUBMIT_START' }))).toBe(false);
  });
});
