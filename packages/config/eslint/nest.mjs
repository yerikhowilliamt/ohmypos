// @ts-check
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.mjs';

/**
 * ESLint preset for `apps/api` (NestJS). Adds the Jest globals and the
 * CommonJS source type NestJS compiles to, matching Kasync's own config.
 *
 * @param {string} tsconfigRootDir normally `import.meta.dirname`
 */
export function nestConfig(tsconfigRootDir) {
  return tseslint.config(...baseConfig(tsconfigRootDir), {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
    },
  });
}

export default nestConfig;
