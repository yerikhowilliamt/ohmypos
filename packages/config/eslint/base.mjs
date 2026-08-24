// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint baseline for every workspace (Playbook §2, §13).
 *
 * Rule set carried over from Kasync's `eslint.config.mjs` so ported code lints
 * against the config it was written for. `no-explicit-any` is an error rather
 * than a warning because AGENTS.md states the `any` type is never permitted.
 *
 * @param {string} tsconfigRootDir absolute path to the consuming workspace,
 *   normally `import.meta.dirname`. Typed linting needs this to resolve the
 *   right tsconfig per package rather than one at the repo root.
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
        // Emitted declarations are never linted — they aren't in any tsconfig's
        // include, so typed linting cannot resolve them.
        '**/*.d.ts',
        // Generated code is never hand-edited, so linting it only produces
        // noise. Prisma 7 emits its client as TypeScript into the source tree.
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
