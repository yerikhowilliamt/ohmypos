import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE_SECONDS,
} from '@/lib/impersonation';

/**
 * ADR-025 Decision 8 — moves an impersonation token into the browser.
 *
 * `POST /platform/tenants/:id/impersonate` returns the token in its body, not
 * as a cookie, so this same-origin handler is what installs it as
 * `access_token`. It has to be a route handler rather than client code because
 * the cookie is HttpOnly by design.
 *
 * It does NOT mint or validate anything: whatever is stored here is still
 * checked by `JwtAuthGuard` on every tenant request, and reduced to `GET` by
 * `ImpersonationReadOnlyGuard`. Storing a bogus value simply produces 401s.
 *
 * `DELETE` clears both cookies. Note what it cannot do: the token stays valid
 * on the API until its 30 minutes run out — there is no revocation list for
 * impersonation tokens (see TASK-126). Leaving the console is therefore a
 * matter of discarding the credential, which is exactly what this does.
 */

interface StartBody {
  accessToken?: unknown;
  tenantName?: unknown;
}

export async function POST(request: Request) {
  let payload: StartBody;
  try {
    payload = (await request.json()) as StartBody;
  } catch {
    return NextResponse.json({ message: 'Body tidak valid' }, { status: 400 });
  }

  const { accessToken, tenantName } = payload;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return NextResponse.json(
      { message: 'Token impersonasi tidak ada dalam permintaan.' },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
  });

  // Readable by the client on purpose — see the note on IMPERSONATION_COOKIE.
  response.cookies.set(
    IMPERSONATION_COOKIE,
    typeof tenantName === 'string' && tenantName.length > 0
      ? tenantName
      : 'tenant',
    {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    },
  );

  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(IMPERSONATION_COOKIE);
  return response;
}
