import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

/**
 * ADR-025 — the console's front door.
 *
 * This is the first place a wrong-audience visitor is turned away, and the two
 * cookies are easy to confuse in a file that already had one. The regression
 * cases matter as much as the new ones: adding a `/platform` branch above the
 * existing rules is exactly the shape of change that quietly reorders them.
 */

const BASE = 'http://localhost:3001';

function requestFor(
  pathname: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const request = new NextRequest(new URL(pathname, BASE));
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

/** The `Location` a redirect points at, or null when the request passed through. */
function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  return location
    ? new URL(location).pathname + new URL(location).search
    : null;
}

describe('proxy — platform console (ADR-025)', () => {
  it('sends an anonymous visitor to the platform login, not the tenant one', () => {
    const res = proxy(requestFor('/platform'));
    expect(redirectTarget(res)).toBe('/platform/login?next=%2Fplatform');
  });

  it('does the same for a nested console route, preserving where they were going', () => {
    const res = proxy(requestFor('/platform/tenants/abc'));
    expect(redirectTarget(res)).toBe(
      '/platform/login?next=%2Fplatform%2Ftenants%2Fabc',
    );
  });

  it('refuses a TENANT session on the console', () => {
    // The whole point of the separate cookie: a signed-in shop OWNER holds a
    // valid `access_token` and must still be stopped here.
    const res = proxy(requestFor('/platform', { access_token: 'tenant-jwt' }));
    expect(redirectTarget(res)).toBe('/platform/login?next=%2Fplatform');
  });

  it('lets a platform session through', () => {
    const res = proxy(
      requestFor('/platform/tenants', {
        platform_access_token: 'platform-jwt',
      }),
    );
    expect(redirectTarget(res)).toBeNull();
  });

  it('leaves the platform login reachable with no cookies at all', () => {
    expect(redirectTarget(proxy(requestFor('/platform/login')))).toBeNull();
  });

  it('bounces an already-signed-in operator off the platform login', () => {
    const res = proxy(
      requestFor('/platform/login', { platform_access_token: 'platform-jwt' }),
    );
    expect(redirectTarget(res)).toBe('/platform');
  });

  it('does not treat a lookalike path as the console', () => {
    // `/platforms` must fall through to the tenant rules, not the platform ones.
    const res = proxy(requestFor('/platforms'));
    expect(redirectTarget(res)).toBe('/login?next=%2Fplatforms');
  });
});

describe('proxy — tenant routes still behave as before', () => {
  it('redirects an anonymous visitor to the tenant login', () => {
    expect(redirectTarget(proxy(requestFor('/dashboard')))).toBe(
      '/login?next=%2Fdashboard',
    );
  });

  it('lets a tenant session through', () => {
    const res = proxy(requestFor('/dashboard', { access_token: 'tenant-jwt' }));
    expect(redirectTarget(res)).toBeNull();
  });

  it('bounces a signed-in user off the tenant login', () => {
    const res = proxy(requestFor('/login', { access_token: 'tenant-jwt' }));
    expect(redirectTarget(res)).toBe('/');
  });

  it('does NOT accept a platform cookie as a tenant session', () => {
    const res = proxy(
      requestFor('/dashboard', { platform_access_token: 'platform-jwt' }),
    );
    expect(redirectTarget(res)).toBe('/login?next=%2Fdashboard');
  });

  it('leaves the public files alone', () => {
    for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt']) {
      expect(redirectTarget(proxy(requestFor(path)))).toBeNull();
    }
  });
});
