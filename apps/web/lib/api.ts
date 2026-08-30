import { BROWSER_API_BASE_URL, resolveBackendApiBaseUrl } from './api-url';

function resolveApiBaseUrl(): string {
  return typeof window !== 'undefined'
    ? BROWSER_API_BASE_URL
    : resolveBackendApiBaseUrl();
}

const API_BASE_URL = resolveApiBaseUrl();

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

/** Shown when the request never reached a server. */
const OFFLINE_MESSAGE =
  'Tidak dapat terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.';

/**
 * Used only when the server returned an error with no message of its own — a
 * gateway HTML page, say. Every message the API itself writes is already
 * Indonesian (`apps/api/src/common/messages.ts`); this covers the gap where
 * there is nothing to pass through.
 */
function fallbackMessageFor(status: number): string {
  if (status === 401 || status === 403) {
    return 'Sesi Anda sudah berakhir atau Anda tidak memiliki izin. Silakan masuk kembali.';
  }
  if (status === 404) {
    return 'Data yang diminta tidak ditemukan. Muat ulang halaman.';
  }
  if (status === 413) {
    return 'Berkas terlalu besar untuk diunggah.';
  }
  if (status >= 500) {
    return 'Server sedang bermasalah. Coba lagi beberapa saat lagi.';
  }
  return 'Permintaan tidak dapat diproses. Coba lagi.';
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

  // Lets a user-reported error be traced back to the exact server log line
  // (Phase 14 E-8) — the id itself is echoed back on the response (E-7).
  const correlationId = crypto.randomUUID();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: isFormData
        ? { 'x-correlation-id': correlationId, ...init?.headers }
        : {
            'Content-Type': 'application/json',
            'x-correlation-id': correlationId,
            ...init?.headers,
          },
    });
  } catch (cause) {
    // `fetch` rejects — no response at all — when the device is offline or the
    // server is unreachable. The browser's own wording then travelled straight
    // to the screen through every `catch (e) { e.message }` in the app:
    // "Failed to fetch" in Chrome, "Load failed" in Safari,
    // "NetworkError when attempting to fetch resource" in Firefox. Three
    // different English sentences in an Indonesian product, for the one
    // failure a user is most likely to hit.
    throw new ApiError(OFFLINE_MESSAGE, 0, { cause });
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
      errors?: { message?: string }[];
    } | null;
    // A schema rejection carries the useful text in `errors[].message` — each
    // one names the field and what to do. `message` is only the library's
    // English wrapper, "Validation failed", which tells the reader nothing.
    const fieldErrors = (body?.errors ?? [])
      .map((issue) => issue.message)
      .filter((text): text is string => Boolean(text));
    const message =
      fieldErrors.length > 0
        ? fieldErrors.join(' ')
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : (body?.message ?? fallbackMessageFor(res.status));
    throw new ApiError(message, res.status, body);
  }

  return res.json() as Promise<T>;
}

/**
 * ADR-025 — there are TWO audiences behind this client, with two cookie pairs
 * and two refresh endpoints. Which one a 401 belongs to is decided by the path,
 * because nothing else on the response says so.
 *
 * Getting this wrong is not cosmetic: a platform 401 refreshed against
 * `/auth/refresh` would send the operator to `/login`, the shop owner's page,
 * with their console session still perfectly valid.
 */
interface Audience {
  refreshPath: string;
  loginHref: string;
}

const TENANT: Audience = { refreshPath: '/auth/refresh', loginHref: '/login' };
const PLATFORM: Audience = {
  refreshPath: '/platform/auth/refresh',
  loginHref: '/platform/login',
};

function audienceFor(path: string): Audience {
  return path.startsWith('/platform/') ? PLATFORM : TENANT;
}

/**
 * Concurrent 401s share a single refresh call per audience: the backend rotates
 * the refresh token on every call, so two simultaneous refreshes would
 * invalidate each other. Keyed by refresh path so a tenant refresh and a
 * platform refresh never share (or cancel) one another's promise.
 */
const refreshPromises = new Map<string, Promise<void>>();

function refreshTokenOnce(audience: Audience): Promise<void> {
  const existing = refreshPromises.get(audience.refreshPath);
  if (existing) return existing;

  const promise = doFetch(audience.refreshPath, { method: 'POST' })
    .then(() => undefined)
    .catch((error) => {
      if (typeof window !== 'undefined') {
        // Runs outside a component (no router available) — a full reload
        // is also correct here, clearing any in-memory state after a
        // fatal auth failure.

        window.location.href = audience.loginHref;
      }
      throw error;
    })
    .finally(() => {
      refreshPromises.delete(audience.refreshPath);
    });

  refreshPromises.set(audience.refreshPath, promise);
  return promise;
}

/** A 401 here means bad credentials, not a stale token — refreshing won't help. */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/platform/auth/login',
  '/platform/auth/refresh',
];

/**
 * The frontend talks to apps/api over REST only, never to the database
 * (ADR-002). Credentials are always included so the HttpOnly session cookies
 * travel with the request — the token is never read by JavaScript.
 *
 * A 401 from any other endpoint is treated as a stale access token: it
 * triggers one silent refresh — `/auth/refresh` for tenant paths,
 * `/platform/auth/refresh` for `/platform/*` ones (ADR-025) — deduplicated
 * across concurrent callers, and retries the original request once before
 * giving up.
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
      await refreshTokenOnce(audienceFor(path));
      return doFetch<T>(path, init);
    }
    throw error;
  }
}

export { API_BASE_URL };
