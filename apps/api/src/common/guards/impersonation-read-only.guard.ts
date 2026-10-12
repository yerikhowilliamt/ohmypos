import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload.interface';
import { IMPERSONATION_IS_READ_ONLY } from '../messages';

/**
 * Allows only `GET` for impersonation tokens (ADR-025 Decision 8). Global, so no
 * tenant route can forget to opt in. Widening the method list needs a new ADR.
 */
@Injectable()
export class ImpersonationReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      method: string;
    }>();

    if (!request.user?.imp) {
      return true;
    }

    if (request.method !== 'GET') {
      throw new ForbiddenException(IMPERSONATION_IS_READ_ONLY);
    }

    return true;
  }
}
