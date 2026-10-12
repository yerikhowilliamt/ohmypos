import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnscopedPrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../prisma/tenant-context';
import type { PlatformJwtPayload } from '../types/platform-jwt-payload.interface';
import { PLATFORM_ACCESS_TOKEN_COOKIE } from '../constants/cookie.constants';
import {
  PLATFORM_ACCOUNT_DEACTIVATED,
  SERVER_MISCONFIGURED,
  SESSION_EXPIRED,
} from '../messages';

/**
 * Platform admin authentication: the `JwtAuthGuard` checks against the platform
 * key pair and `platform_admins`.
 *
 * Not global. A `@Public()` platform route without this guard is open to
 * anyone (DEBT-066); see `common/README.md`.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    // Unscoped: platform admins belong to no tenant.
    private readonly prisma: UnscopedPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
      platformAdmin?: PlatformJwtPayload;
    }>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const secret = process.env.PLATFORM_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(SERVER_MISCONFIGURED);
    }

    let payload: PlatformJwtPayload;
    try {
      // A tenant token fails here: the secrets separate the two audiences.
      payload = await this.jwtService.verifyAsync<PlatformJwtPayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, tokenValidFrom: true },
    });

    if (!admin) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    if (!admin.isActive) {
      throw new UnauthorizedException(PLATFORM_ACCOUNT_DEACTIVATED);
    }

    // 1000ms = `iat` resolution, as in JwtAuthGuard.
    const IAT_RESOLUTION_MS = 1000;
    if (
      payload.iat !== undefined &&
      payload.iat * 1000 + IAT_RESOLUTION_MS <= admin.tokenValidFrom.getTime()
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    request.platformAdmin = { sub: admin.id, email: admin.email };

    // tenantId stays null, so the scoped client throws instead of reading a tenant.
    const scope = tenantStorage.getStore();
    if (!scope) {
      // TenantScopeMiddleware did not run; fail closed.
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    scope.platformAdminId = admin.id;

    return true;
  }

  private extractToken(request: {
    cookies?: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const cookieToken = request.cookies?.[PLATFORM_ACCESS_TOKEN_COOKIE];
    if (cookieToken) {
      return cookieToken;
    }

    const authHeader = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;

    return authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : undefined;
  }
}
