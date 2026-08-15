import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ohmypos/api-contracts';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../types/jwt-payload.interface';

/**
 * Checks the caller's role against the endpoint's `@Roles(...)` declaration
 * (ADR-011 §4, Playbook §8). Endpoints without the decorator allow any
 * authenticated role — the restriction is always explicit.
 *
 * This is the authoritative check. The frontend's role-based routing is a UX
 * convenience and is never trusted (System Design §5).
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} is not permitted to perform this action`,
      );
    }

    return true;
  }
}
