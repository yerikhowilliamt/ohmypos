import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'access_token';
/** ADR-025 — the platform console carries its own cookie, signed with its own
 * key pair. Checking `access_token` here would let a signed-in shop OWNER walk
 * into `/platform` and only be stopped a layer later. */
const PLATFORM_ACCESS_TOKEN_COOKIE = 'platform_access_token';

/**
 * Redirects before render when the session cookie is missing. It cannot verify
 * the JWT; role gating happens in the route-group layouts.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(ACCESS_TOKEN_COOKIE);
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';
  const isPublicRoute =
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/llms.txt';

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // `/platform/**` has its own cookie and is gated first.
  if (pathname === '/platform' || pathname.startsWith('/platform/')) {
    const hasPlatformSession = request.cookies.has(
      PLATFORM_ACCESS_TOKEN_COOKIE,
    );
    const isPlatformLogin = pathname === '/platform/login';

    if (!hasPlatformSession && !isPlatformLogin) {
      const loginUrl = new URL('/platform/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (hasPlatformSession && isPlatformLogin) {
      return NextResponse.redirect(new URL('/platform', request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession && !isLoginPage) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.webp|robots\\.txt|sitemap\\.xml|llms\\.txt).*)',
  ],
};
