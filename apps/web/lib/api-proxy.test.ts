import { describe, expect, it, vi } from 'vitest';
import { proxyApiRequest } from './api-proxy';

const BACKEND_URL = 'https://backend.example.com/api/v1';

function mockFetch(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe('proxyApiRequest', () => {
  it('forwards method, query, JSON body, cookies, and tracing headers', async () => {
    const fetchUpstream = mockFetch(
      Response.json({ id: 'sale-1' }, { status: 201 }),
    );
    const request = new Request('https://web.example.com/api/v1/sales?page=2', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'access_token=access-value',
        origin: 'https://web.example.com',
        'x-correlation-id': 'correlation-1',
      },
      body: JSON.stringify({ total: '10000.00' }),
    });

    const response = await proxyApiRequest(request, ['sales'], {
      backendApiBaseUrl: BACKEND_URL,
      fetch: fetchUpstream,
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: 'sale-1' });

    const [target, init] = fetchUpstream.mock.calls[0] ?? [];
    expect(String(target)).toBe(`${BACKEND_URL}/sales?page=2`);
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'manual',
      duplex: 'half',
    });
    expect(new Headers(init?.headers).get('cookie')).toBe(
      'access_token=access-value',
    );
    expect(new Headers(init?.headers).get('x-correlation-id')).toBe(
      'correlation-1',
    );
    await expect(new Response(init?.body).text()).resolves.toBe(
      JSON.stringify({ total: '10000.00' }),
    );
  });

  it('streams multipart bodies without replacing their boundary', async () => {
    const fetchUpstream = mockFetch(Response.json({ imported: 1 }));
    const body = '--boundary\r\nfile-content\r\n--boundary--';
    const request = new Request(
      'https://web.example.com/api/v1/import/csv/account-1?format=BCA',
      {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=boundary',
          origin: 'https://web.example.com',
        },
        body,
      },
    );

    await proxyApiRequest(request, ['import', 'csv', 'account-1'], {
      backendApiBaseUrl: BACKEND_URL,
      fetch: fetchUpstream,
    });

    const init = fetchUpstream.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'multipart/form-data; boundary=boundary',
    );
    await expect(new Response(init?.body).text()).resolves.toBe(body);
  });

  it('preserves backend status, correlation header, and separate auth cookies', async () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'content-length': '999',
      'x-correlation-id': 'correlation-2',
    });
    headers.append(
      'set-cookie',
      'access_token=access-value; Path=/; HttpOnly; Secure',
    );
    headers.append(
      'set-cookie',
      'refresh_token=refresh-value; Path=/; HttpOnly; Secure',
    );
    const fetchUpstream = mockFetch(
      new Response(JSON.stringify({ message: 'Invalid credentials' }), {
        status: 401,
        headers,
      }),
    );

    const response = await proxyApiRequest(
      new Request('https://web.example.com/api/v1/auth/login'),
      ['auth', 'login'],
      { backendApiBaseUrl: BACKEND_URL, fetch: fetchUpstream },
    );

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([
      'access_token=access-value; Path=/; HttpOnly; Secure',
      'refresh_token=refresh-value; Path=/; HttpOnly; Secure',
    ]);
    expect(response.headers.get('x-correlation-id')).toBe('correlation-2');
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(response.headers.has('content-length')).toBe(false);
  });

  it('rejects an unsafe request from another browser origin', async () => {
    const fetchUpstream = mockFetch(Response.json({ ok: true }));
    const response = await proxyApiRequest(
      new Request('https://web.example.com/api/v1/sales', {
        method: 'POST',
        headers: { origin: 'https://attacker.example.com' },
        body: '{}',
      }),
      ['sales'],
      { backendApiBaseUrl: BACKEND_URL, fetch: fetchUpstream },
    );

    expect(response.status).toBe(403);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it('returns a traceable 502 without leaking the upstream failure', async () => {
    const fetchUpstream = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private upstream detail'));
    const response = await proxyApiRequest(
      new Request('https://web.example.com/api/v1/health', {
        headers: { 'x-correlation-id': 'correlation-3' },
      }),
      ['health'],
      { backendApiBaseUrl: BACKEND_URL, fetch: fetchUpstream },
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('x-correlation-id')).toBe('correlation-3');
    await expect(response.json()).resolves.toEqual({
      message:
        'Server sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.',
    });
  });
});
