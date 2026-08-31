import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UnscopedPrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../types/jwt-payload.interface';
import { TENANT_SUSPENDED } from '../messages';

/**
 * ADR-025 Fase 2 — a suspended tenant can still authenticate, but cannot use
 * the application.
 *
 * Registered after `JwtAuthGuard` in the APP_GUARD array (that array's order is
 * its execution order), so `request.user` is populated by the time this runs.
 * A request with no user is either `@Public()` or a platform route, and is not
 * this guard's business.
 *
 * Two routes are exempt on purpose, and the list is deliberately this short —
 * every entry is a route a suspended tenant's user can still reach:
 *
 * - `POST /auth/logout`: a user suspended mid-session must still be able to end
 *   that session cleanly, rather than be left holding a cookie every other
 *   endpoint rejects.
 * - `GET /auth/me` (TASK-132): without it, the frontend cannot tell "signed
 *   out" from "signed in to a suspended business" — `getSession()` saw a 403,
 *   returned null, and every page bounced the owner back to the login screen
 *   with no way to learn why. The endpoint returns the caller's own identity
 *   plus `tenantStatus`, and no business data whatsoever, so exempting it
 *   reveals nothing the caller did not already supply by logging in.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly prisma: UnscopedPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload & { tenantId?: string };
      method: string;
      path?: string;
      originalUrl?: string;
    }>();

    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      return true;
    }

    if (this.isExempt(request)) {
      return true;
    }

    // ADR-025 Decision 8 — an impersonation session is exempt. The most likely
    // reason a platform operator opens a tenant's books is to work out why it
    // was suspended, and a suspended tenant is exactly the one they cannot
    // otherwise ask to log in and show them. Safe to exempt because
    // ImpersonationReadOnlyGuard has already reduced this token to GET only, so
    // the exemption grants reading and nothing else.
    if (request.user?.imp) {
      return true;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });

    if (tenant?.status === 'SUSPENDED') {
      throw new ForbiddenException(TENANT_SUSPENDED);
    }

    return true;
  }

  private isExempt(request: {
    method: string;
    path?: string;
    originalUrl?: string;
  }): boolean {
    const url = (request.path ?? request.originalUrl ?? '').split('?')[0];
    // Matched on method AND path: `PATCH /auth/me` renames the user and must
    // stay blocked, so exempting the path alone would open a write.
    if (request.method === 'POST') return url.endsWith('/auth/logout');
    if (request.method === 'GET') return url.endsWith('/auth/me');
    return false;
  }
}
