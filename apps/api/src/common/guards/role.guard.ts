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
import { SESSION_EXPIRED } from '../messages';

/**
 * Enforces `@Roles(...)`; endpoints without it allow any authenticated role.
 * This is the authoritative check; frontend routing is never trusted.
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
      throw new ForbiddenException(SESSION_EXPIRED);
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        'Peran akun Anda tidak memiliki izin untuk tindakan ini. Hubungi Owner bila Anda memerlukan akses.',
      );
    }

    return true;
  }
}
