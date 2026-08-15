// @ts-check
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/**
 * Shared ESLint overrides for `apps/web` (Next.js).
 *
 * Unlike the Nest preset, this does NOT re-export a full baseline. Next ships
 * its own flat configs (`eslint-config-next/core-web-vitals` and
 * `eslint-config-next/typescript`) which already register typescript-eslint —
 * registering it a second time from our base config would collide. Next's
 * config is also version-locked to the Next release, so it stays a dependency
 * of `apps/web` rather than of this package.
 *
 * What lives here is the part that must not drift between workspaces: the
 * Prettier integration and the shared rule overrides. `apps/web` composes
 * Next's configs first, then spreads this.
 */
export const nextOverrides = [
  eslintPluginPrettierRecommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
];

export default nextOverrides;
