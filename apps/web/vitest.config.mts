import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    globals: true,
    exclude: ['node_modules/**', '.next/**'],
    // Radix dialogs/popovers in jsdom are slow; 5s default flakes under
    // turbo's parallel lint/typecheck/build CPU load.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 74,
        lines: 81,
      },
    },
  },
});
