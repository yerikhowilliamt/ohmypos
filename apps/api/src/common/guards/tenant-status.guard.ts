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
 * `POST /auth/logout` is exempt on purpose: a user whose tenant was suspended
 * mid-session must still be able to end that session cleanly, rather than be
 * left holding a cookie that every other endpoint rejects.
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

    if (this.isLogout(request)) {
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

  private isLogout(request: {
    method: string;
    path?: string;
    originalUrl?: string;
  }): boolean {
    if (request.method !== 'POST') return false;
    const url = (request.path ?? request.originalUrl ?? '').split('?')[0];
    return url.endsWith('/auth/logout');
  }
}
