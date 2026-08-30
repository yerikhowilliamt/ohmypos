import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UnscopedPrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../prisma/tenant-context';
import type { JwtPayload } from '../types/jwt-payload.interface';
import { ACCESS_TOKEN_COOKIE } from '../constants/cookie.constants';
import {
  ACCOUNT_DEACTIVATED,
  SERVER_MISCONFIGURED,
  SESSION_EXPIRED,
} from '../messages';

/**
 * Ported from Kasync. Registered globally, so every endpoint is authenticated
 * unless it opts out with `@Public()` — an endpoint added without a guard fails
 * closed rather than open (Playbook §8).
 *
 * Beyond signature verification it checks two things the token alone cannot
 * express: that the session has not been revoked since it was issued
 * (`tokenValidFrom`), and that the user is still active (ADR-011 §5).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    // Unscoped on purpose: this guard is what ESTABLISHES the tenant, so it
    // cannot itself run inside a tenant filter.
    private readonly prisma: UnscopedPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
      user?: JwtPayload;
    }>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // An operator's problem, not the caller's — and naming the variable
      // to an anonymous caller leaks deployment detail.
      throw new UnauthorizedException(SERVER_MISCONFIGURED);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        tokenValidFrom: true,
        isActive: true,
        role: true,
        branchId: true,
        // ADR-025 — the tenant rides along on the round-trip this guard already
        // makes, so establishing it costs nothing extra.
        tenantId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // A deactivated user's existing token must stop working immediately.
    if (!user.isActive) {
      throw new UnauthorizedException(ACCOUNT_DEACTIVATED);
    }

    // Reject tokens issued before tokenValidFrom.
    //
    // The 1000ms allowance is not clock-skew slack — it is exactly the
    // resolution of the JWT `iat` claim, which is whole seconds. A token minted
    // at 10:00:00.900 carries iat = 10:00:00, so comparing raw would wrongly
    // reject it against a tokenValidFrom of 10:00:00.500.
    //
    // Kasync used 2000ms to absorb Node-vs-PostgreSQL clock drift as well; that
    // is no longer needed, because every write of this column now comes from the
    // application clock (see UsersService.create). The consequence to be aware
    // of: revocation is precise to the second, so a token minted within the same
    // second as a logout may survive it. Acceptable at this scale, and far
    // tighter than the access token's own lifetime.
    const IAT_RESOLUTION_MS = 1000;
    if (
      payload.iat !== undefined &&
      payload.iat * 1000 + IAT_RESOLUTION_MS <= user.tokenValidFrom.getTime()
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // Trust the database over the token for role and branch, so a change to
    // either takes effect without waiting for the access token to expire.
    request.user = {
      ...payload,
      role: user.role,
      branchId: user.branchId,
      tenantId: user.tenantId,
    };

    // ADR-025 Decision 2 — the tenant comes from the User row, never from the
    // client. TenantScopeMiddleware opened this scope; the guard fills it.
    const scope = tenantStorage.getStore();
    if (!scope) {
      // The middleware did not run. Fail closed rather than let the request
      // through with no tenant, which the Prisma extension would then reject
      // deep inside a service with a far less legible error.
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    scope.tenantId = user.tenantId;

    return true;
  }

  private extractToken(request: {
    cookies?: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const cookieToken = request.cookies?.[ACCESS_TOKEN_COOKIE];
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
