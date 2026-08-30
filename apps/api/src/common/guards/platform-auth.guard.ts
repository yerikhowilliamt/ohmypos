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
 * ADR-025 Fase 3 — the platform console's counterpart to `JwtAuthGuard`, with
 * the same four checks in the same order: signature, row still exists, still
 * active, token not issued before `tokenValidFrom`.
 *
 * NOT registered globally. `JwtAuthGuard` is the global one, so a platform
 * controller marks itself `@Public()` to get past it and then applies this
 * guard at class level.
 *
 * That is a fail-OPEN shape and it is worth naming plainly: a `@Public()`
 * controller that forgets `@UseGuards(PlatformAuthGuard)` is an unauthenticated
 * endpoint over cross-tenant data, and nothing at compile time notices. The
 * defence is `platform-auth.e2e-spec.ts` (Fase 6), which enumerates every
 * registered `/platform/*` route from the router and demands 401 on each with
 * no token — so a route added later without this guard fails the suite rather
 * than shipping.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    // Platform admins live outside every tenant, so the tenant-filtered client
    // would throw on this read. Unscoped is the only correct client here.
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
      // A tenant access token reaches this line signed with JWT_SECRET and is
      // rejected here — the secrets are what separate the two audiences.
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

    // Same 1000ms allowance, for the same reason, as JwtAuthGuard: the `iat`
    // claim has whole-second resolution, so a token minted at 10:00:00.900
    // carries iat = 10:00:00 and would otherwise be rejected against a
    // tokenValidFrom of 10:00:00.500.
    const IAT_RESOLUTION_MS = 1000;
    if (
      payload.iat !== undefined &&
      payload.iat * 1000 + IAT_RESOLUTION_MS <= admin.tokenValidFrom.getTime()
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    request.platformAdmin = { sub: admin.id, email: admin.email };

    // ADR-025 §3.3 — record WHO is acting, but leave `tenantId` null. A
    // platform route that reaches for a tenant-scoped model through the
    // filtered `PrismaService` then throws TenantContextMissingError instead of
    // quietly reading whichever tenant happened to be in scope. Platform
    // services use `UnscopedPrismaService` deliberately.
    const scope = tenantStorage.getStore();
    if (!scope) {
      // TenantScopeMiddleware did not run. Fail closed for the same reason
      // JwtAuthGuard does.
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
