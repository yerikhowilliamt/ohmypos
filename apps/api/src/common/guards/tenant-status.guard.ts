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
 * Blocks users of a suspended tenant (ADR-025). Exempt: `POST /auth/logout`,
 * `GET /auth/me`, and impersonation sessions. See `common/README.md`.
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

    // Impersonation is already GET-only, so this exemption grants reads only.
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
    // Method AND path: `PATCH /auth/me` must stay blocked.
    if (request.method === 'POST') return url.endsWith('/auth/logout');
    if (request.method === 'GET') return url.endsWith('/auth/me');
    return false;
  }
}
