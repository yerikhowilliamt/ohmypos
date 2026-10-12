// @ts-check
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/**
 * Shared overrides for `apps/web`. Not a full baseline: Next's own configs
 * already register typescript-eslint, so `apps/web` composes them first.
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
