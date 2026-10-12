// @ts-check
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.mjs';

/**
 * Preset for `apps/api`: adds Jest globals and CommonJS.
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
