import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload.interface';
import { IMPERSONATION_IS_READ_ONLY } from '../messages';

/**
 * ADR-025 Decision 8 — an impersonation token may only read.
 *
 * Registered globally, immediately after `JwtAuthGuard` (whose job is to put
 * `request.user` there) and before `RoleGuard`. Global rather than per-route on
 * purpose: an impersonation token is presented to ORDINARY tenant endpoints, so
 * a per-endpoint opt-in would mean every one of the ~120 existing routes had to
 * remember to opt in, and the one that forgot would be the writable hole.
 *
 * A request with no `imp` claim is an ordinary session and is none of this
 * guard's business.
 *
 * Only `GET` passes, which is the decision as written. `HEAD` is therefore
 * blocked too — Nest answers HEAD from the matching `@Get()` handler, so this
 * is a real (if harmless) restriction, and it is left in place rather than
 * quietly widened, because the set of methods an impersonated session may use
 * is exactly the thing ADR-025 says needs a new ADR to change.
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
