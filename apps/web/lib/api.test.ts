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
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/whoami',
      expect.objectContaining({ credentials: 'include' }),
    );
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

describe('error messages a user actually reads', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('replaces the browser’s English network error with Indonesian', async () => {
    // Chrome throws "Failed to fetch", Safari "Load failed", Firefox
    // "NetworkError when attempting to fetch resource" — three English
    // sentences that used to reach the screen verbatim.
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('/anything')).rejects.toThrow(
      /Tidak dapat terhubung ke server/,
    );
  });

  it('prefers the field-level messages over the library’s English wrapper', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        message: 'Validation failed',
        errors: [{ message: 'Kata sandi wajib diisi' }],
      }),
    } as Response);

    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toThrow(
      'Kata sandi wajib diisi',
    );
  });

  it('falls back to Indonesian when the server sends no message at all', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => null,
    } as unknown as Response);

    await expect(apiFetch('/anything')).rejects.toThrow(
      /Server sedang bermasalah/,
    );
  });
});
