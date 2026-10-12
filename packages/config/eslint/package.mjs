// @ts-check
import { baseConfig } from './base.mjs';

/**
 * Preset for framework-free packages (`api-contracts`, `ui`).
 *
 * @param {string} tsconfigRootDir normally `import.meta.dirname`
 */
export function packageConfig(tsconfigRootDir) {
  return baseConfig(tsconfigRootDir);
}

export default packageConfig;
