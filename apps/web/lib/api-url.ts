export const BROWSER_API_BASE_URL = '/api/v1';

const DEFAULT_BACKEND_API_BASE_URL = 'http://localhost:4015/api/v1';

/**
 * The browser always uses the Next.js origin so auth cookies belong to the web
 * host and are visible to proxy.ts and Server Components. Only the Next.js
 * server talks to the backend origin directly.
 */
export function normalizeBackendApiBaseUrl(rawBackend: string): string {
  const clean = rawBackend.trim().replace(/\/+$/, '');
  const withApiPrefix = clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  const parsed = new URL(withApiPrefix);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Backend API URL must use http or https');
  }

  return withApiPrefix;
}

export function resolveBackendApiBaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return normalizeBackendApiBaseUrl(
    env.INTERNAL_API_BASE_URL ||
      env.BACKEND_API_URL ||
      env.NEXT_PUBLIC_API_BASE_URL ||
      DEFAULT_BACKEND_API_BASE_URL,
  );
}
