import * as React from 'react';

/**
 * Where Radix portals mount. Back-office dark mode provides its themed subtree;
 * the default `null` keeps Radix's `document.body`.
 */
export const PortalContainerContext = React.createContext<HTMLElement | null>(
  null,
);

export function usePortalContainer(): HTMLElement | null {
  return React.useContext(PortalContainerContext);
}
