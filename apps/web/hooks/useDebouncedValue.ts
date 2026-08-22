'use client';

import * as React from 'react';

/**
 * Holds a value back until the user stops typing.
 *
 * Used by the server-side search boxes: without it every keystroke is a
 * request, and a slower earlier request can land after a faster later one and
 * overwrite the correct result with a stale one.
 *
 * Written here rather than pulled from a package — adding a dependency needs
 * approval (AGENTS.md §Governance) and this is twelve lines.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
