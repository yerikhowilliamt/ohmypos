import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MEDIA, useIsRail, useMediaQuery } from './useMediaQuery';

type Listener = () => void;

/**
 * jsdom ships no `matchMedia`. This stub records listeners so a test can flip
 * the match state and assert the hook re-renders.
 */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;

  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    addEventListener: (_: string, cb: Listener) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: Listener) => {
      listeners.delete(cb);
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  });

  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useMediaQuery', () => {
  it('reports the current match state', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('re-renders when the media query starts matching', () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useIsRail());
    expect(result.current).toBe(false);

    act(() => mm.set(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const mm = installMatchMedia(false);
    const { unmount } = renderHook(() => useIsRail());
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });

  it('returns false when matchMedia is unavailable (SSR path)', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    const { result } = renderHook(() => useMediaQuery(MEDIA.tablet));
    expect(result.current).toBe(false);
  });
});
