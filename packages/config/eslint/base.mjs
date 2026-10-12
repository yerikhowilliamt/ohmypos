// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint baseline (Kasync's rules; `no-explicit-any` is an error).
 *
 * @param {string} tsconfigRootDir the consuming workspace, normally `import.meta.dirname`
 */
export function baseConfig(tsconfigRootDir) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        'build/**',
        '.next/**',
        'coverage/**',
        'node_modules/**',
        '**/*.config.mjs',
        '**/*.config.js',
        // Emitted declarations are in no tsconfig, so typed linting cannot resolve them.
        '**/*.d.ts',
        // Generated Prisma client.
        '**/generated/**',
      ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        'prettier/prettier': ['error', { endOfLine: 'auto' }],
      },
    },
  );
}

export default baseConfig;
