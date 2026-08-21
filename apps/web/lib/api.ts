const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4015/api/v1';

/** Thrown by `apiFetch` for any non-2xx response; carries the HTTP status so
 * callers — and the refresh-on-401 logic below — can branch on it.
 *
 * `body` is the parsed error payload. Domain exceptions that carry structured
 * detail (`InsufficientStockException`'s `details.shortfalls`) need more than the
 * flattened message: the POS maps each shortfall back to the cart lines that
 * caused it. Optional, so every existing call site is unaffected. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function doFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // A FormData body must NOT carry an explicit Content-Type: the browser has to
  // set `multipart/form-data; boundary=…` itself, and an explicit header would
  // omit the boundary and make the request unparseable server-side. The only
  // callers today are the bank-statement imports (POST /import/csv/:accountId
  // and /import/pdf/:accountId, PRD §5.7); every other call site is JSON and
  // keeps its previous behaviour.
  const isFormData =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: isFormData
      ? { ...init?.headers }
      : { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(message, res.status, body);
  }

  return res.json() as Promise<T>;
}

/**
 * Concurrent 401s share a single `/auth/refresh` call: the backend rotates
 * the refresh token on every call, so two simultaneous refreshes would
 * invalidate each other.
 */
let refreshPromise: Promise<void> | null = null;

function refreshTokenOnce(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = doFetch('/auth/refresh', { method: 'POST' })
      .then(() => undefined)
      .catch((error) => {
        if (typeof window !== 'undefined') {
          // Runs outside a component (no router available) — a full reload
          // is also correct here, clearing any in-memory state after a
          // fatal auth failure.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/login';
        }
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** A 401 here means bad credentials, not a stale token — refreshing won't help. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh'];

/**
 * The frontend talks to apps/api over REST only, never to the database
 * (ADR-002). Credentials are always included so the HttpOnly session cookies
 * travel with the request — the token is never read by JavaScript.
 *
 * A 401 from any other endpoint is treated as a stale access token: it
 * triggers one silent `/auth/refresh` (deduplicated across concurrent
 * callers) and retries the original request once before giving up.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  try {
    return await doFetch<T>(path, init);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      !NO_REFRESH_PATHS.includes(path)
    ) {
      await refreshTokenOnce();
      return doFetch<T>(path, init);
    }
    throw error;
  }
}

export { API_BASE_URL };
