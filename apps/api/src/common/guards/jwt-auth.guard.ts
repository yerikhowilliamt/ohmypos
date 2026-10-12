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
 * Global tenant authentication; opt out with `@Public()`. Verifies the token,
 * rejects revoked sessions and inactive users, and establishes the tenant
 * scope from the user row.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    // Unscoped: this guard establishes the tenant.
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
      // Never name the missing variable to the caller.
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
        tenantId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    if (!user.isActive) {
      throw new UnauthorizedException(ACCOUNT_DEACTIVATED);
    }

    // Revocation check. 1000ms = `iat` resolution (whole seconds), not clock-skew slack.
    const IAT_RESOLUTION_MS = 1000;
    if (
      payload.iat !== undefined &&
      payload.iat * 1000 + IAT_RESOLUTION_MS <= user.tokenValidFrom.getTime()
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // Role and branch come from the database, so changes apply immediately.
    request.user = {
      ...payload,
      role: user.role,
      branchId: user.branchId,
      tenantId: user.tenantId,
    };

    // The tenant comes from the user row, never the client (ADR-025).
    const scope = tenantStorage.getStore();
    if (!scope) {
      // TenantScopeMiddleware did not run; fail closed.
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
