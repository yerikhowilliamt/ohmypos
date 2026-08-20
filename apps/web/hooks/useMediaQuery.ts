'use client';

import * as React from 'react';

/**
 * SSR-safe media query subscription.
 *
 * `useSyncExternalStore`'s third argument is the server snapshot: on the server
 * and during hydration there is no `window.matchMedia`, so every query reports
 * `false`. That is deliberate — the desktop layout (the primary target,
 * DESIGN.md §41) is what renders first, and the tablet rail swaps in on the
 * client once `matchMedia` is available. Defaulting the other way would flash
 * the rail on every desktop load.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * DESIGN.md §41.1 breakpoints, as media query strings. Kept here so no screen
 * hand-writes a pixel value — §41.1 forbids ad-hoc per-screen breakpoints.
 */
export const MEDIA = {
  /** < 768px — condensed shell, sidebar hidden behind the drawer. */
  mobile: '(max-width: 767px)',
  /** 768–1023px — the icon-only sidebar rail (§41.2). */
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  /** >= 1024px — full expanded sidebar. */
  desktop: '(min-width: 1024px)',
} as const;

/** True only in the 768–1023px band, where the sidebar is a 64px icon rail. */
export function useIsRail(): boolean {
  return useMediaQuery(MEDIA.tablet);
}

/** True below 768px, where POS collapses to a single column (§41.3). */
export function useIsMobile(): boolean {
  return useMediaQuery(MEDIA.mobile);
}
