import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * First line of route gating: redirect before a page renders, so an
 * unauthenticated visitor never sees a flash of protected UI.
 *
 * Proxy cannot verify the JWT's signature without the secret, so it only
 * checks that a session cookie is present. Role-level gating happens in the
 * route-group layouts, which ask the API who the user is (System Design §5).
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.webp|robots\\.txt|sitemap\\.xml|llms\\.txt).*)',
  ],
};
