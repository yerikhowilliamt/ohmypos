// @ts-check

/**
 * Shared Prettier config (Playbook §13). Values carried over from Kasync's
 * `.prettierrc` so ported files reformat to the same shape they already have.
 *
 * @type {import('prettier').Config}
 */
const config = {
  singleQuote: true,
  trailingComma: 'all',
};

export default config;
