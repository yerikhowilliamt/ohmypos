'use client';

import * as React from 'react';
import {
  cartReducer,
  initialCartState,
  type CartAction,
  type CartState,
} from '@/lib/pos/cart.reducer';

interface CartContextValue {
  state: CartState;
  dispatch: React.Dispatch<CartAction>;
}

const CartContext = React.createContext<CartContextValue | null>(null);

/** Cart context for the POS route; logic lives in the pure reducer. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(cartReducer, initialCartState);
  const value = React.useMemo(() => ({ state, dispatch }), [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = React.useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
