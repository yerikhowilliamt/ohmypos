// @ts-check
import { baseConfig } from './base.mjs';

/**
 * ESLint preset for framework-free workspaces (`packages/api-contracts`,
 * `packages/ui`). Currently the baseline unchanged — it exists so those
 * packages never import the Nest or Next preset by accident, and so
 * package-only rules have somewhere to go later.
 *
 * @param {string} tsconfigRootDir normally `import.meta.dirname`
 */
export function packageConfig(tsconfigRootDir) {
  return baseConfig(tsconfigRootDir);
}

export default packageConfig;
