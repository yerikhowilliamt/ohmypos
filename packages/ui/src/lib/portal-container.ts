import * as React from 'react';

/**
 * Radix `*.Portal` primitives mount into `document.body` by default, which
 * sits outside any `data-theme` scope on a shell wrapper. Back-office dark
 * mode provides this context so its portals render inside the themed
 * subtree instead; every other caller leaves it at the default `null`, which
 * makes each primitive fall back to Radix's own `document.body` behavior —
 * unchanged from today.
 */
export const PortalContainerContext = React.createContext<HTMLElement | null>(
  null,
);

export function usePortalContainer(): HTMLElement | null {
  return React.useContext(PortalContainerContext);
}
