import { BROWSER_API_BASE_URL, resolveBackendApiBaseUrl } from './api-url';

function resolveApiBaseUrl(): string {
  return typeof window !== 'undefined'
    ? BROWSER_API_BASE_URL
    : resolveBackendApiBaseUrl();
}

const API_BASE_URL = resolveApiBaseUrl();

/** Thrown by `apiFetch` for any non-2xx response. `body` is the parsed error payload (e.g. stock shortfalls). */
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

/** Fallback when the server error has no message of its own (e.g. a gateway HTML page). */
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
  // FormData must not get an explicit Content-Type; the browser adds the boundary.
  const isFormData =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;

  // Correlation id, echoed by the API, so a reported error maps to a log line.
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
    // Offline/unreachable: replace the browser's English "Failed to fetch" with Indonesian copy.
    throw new ApiError(OFFLINE_MESSAGE, 0, { cause });
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
      errors?: { message?: string }[];
    } | null;
    // Validation errors: use the per-field messages, not the generic "Validation failed".
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

/** Which refresh endpoint a 401 belongs to, decided by path: tenant or platform (ADR-025). */
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

/** One in-flight refresh per audience: refresh tokens rotate, so parallel refreshes would cancel each other. */
const refreshPromises = new Map<string, Promise<void>>();

function refreshTokenOnce(audience: Audience): Promise<void> {
  const existing = refreshPromises.get(audience.refreshPath);
  if (existing) return existing;

  const promise = doFetch(audience.refreshPath, { method: 'POST' })
    .then(() => undefined)
    .catch((error) => {
      if (typeof window !== 'undefined') {
        // No router here; a full reload also clears in-memory state.

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
 * REST client for apps/api (ADR-002). Sends the HttpOnly cookies; on a 401 it
 * refreshes once (deduplicated, per audience) and retries the request once.
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
