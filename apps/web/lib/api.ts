const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4013/api/v1';

/**
 * The frontend talks to apps/api over REST only, never to the database
 * (ADR-002). Credentials are always included so the HttpOnly session cookies
 * travel with the request — the token is never read by JavaScript.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `Request failed with status ${res.status}`);
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export { API_BASE_URL };
