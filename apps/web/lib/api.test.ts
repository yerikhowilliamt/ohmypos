import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('returns the parsed body for a successful response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/whoami')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes once and retries after a single 401', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { message: 'stale' }))
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Token refreshed' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/sales')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain(
      '/auth/refresh',
    );
  });

  it('dedupes concurrent 401s into a single refresh call', async () => {
    let refreshCount = 0;
    let sessionValid = false;

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshCount += 1;
        sessionValid = true;
        return jsonResponse(200, { message: 'Token refreshed' });
      }
      if (!sessionValid) {
        return jsonResponse(401, { message: 'stale' });
      }
      return jsonResponse(200, { url });
    });

    const [a, b] = await Promise.all([apiFetch('/one'), apiFetch('/two')]);

    expect(a).toEqual({ url: expect.stringContaining('/one') });
    expect(b).toEqual({ url: expect.stringContaining('/two') });
    expect(refreshCount).toBe(1);
  });

  it('redirects to /login when the refresh call itself fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { message: 'stale' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'refresh expired' }));

    await expect(apiFetch('/sales')).rejects.toThrow();
    expect(window.location.href).toBe('/login');
  });

  it('does not attempt a refresh for a 401 from /auth/login', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(401, { message: 'invalid credentials' }),
    );

    await expect(
      apiFetch('/auth/login', { method: 'POST' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('omits Content-Type for a FormData body so the browser sets the boundary', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { imported: 3, skipped: 0, total: 3 }),
    );

    const form = new FormData();
    form.append('file', new File(['a,b\n1,2'], 'statement.csv'));

    await apiFetch('/import/csv/acc-1?format=BCA', {
      method: 'POST',
      body: form,
    });

    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });

  it('still sets Content-Type for a JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/allocations', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });

    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });
});
