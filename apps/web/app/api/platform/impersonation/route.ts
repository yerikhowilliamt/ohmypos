import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE_SECONDS,
} from '@/lib/impersonation';

/**
 * Installs (POST) or clears (DELETE) the impersonation token as the HttpOnly
 * `access_token` cookie (ADR-025 Decision 8). Validates nothing: the API does.
 * DELETE cannot revoke the token, which stays valid until it expires.
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
