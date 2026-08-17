import * as React from 'react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';

// Radix Select expects scrollIntoView, which jsdom doesn't implement
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (
  typeof HTMLElement !== 'undefined' &&
  !HTMLElement.prototype.hasPointerCapture
) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (
  typeof HTMLElement !== 'undefined' &&
  !HTMLElement.prototype.setPointerCapture
) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (
  typeof HTMLElement !== 'undefined' &&
  !HTMLElement.prototype.releasePointerCapture
) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function renderWithClient(
  ui: React.ReactElement,
  client = createTestQueryClient(),
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient: client,
  };
}
