import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BRANCH_SCOPE_KEY,
  type BranchScopeSource,
} from '../decorators/branch-scoped.decorator';
import type { JwtPayload } from '../types/jwt-payload.interface';
import { OTHER_BRANCH_FORBIDDEN, SESSION_EXPIRED } from '../messages';

interface ScopedRequest {
  user?: JwtPayload;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

/**
 * Restricts a `KASIR` to their own branch on endpoints marked `@BranchScoped`
 * (ADR-011). A missing branch id is rejected, never defaulted. `ADMIN` and
 * `OWNER` pass unscoped.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const source = this.reflector.getAllAndOverride<BranchScopeSource>(
      BRANCH_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!source) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(SESSION_EXPIRED);
    }

    if (user.role !== 'KASIR') {
      return true;
    }

    if (!user.branchId) {
      // Should be impossible, but must never fall through to unscoped access.
      throw new ForbiddenException(
        'Akun kasir ini belum ditugaskan ke cabang mana pun. Minta Owner menetapkan cabang Anda.',
      );
    }

    const [container, field] = source.split('.') as [
      'body' | 'query' | 'params',
      string,
    ];
    const target = request[container];
    const requested = target?.[field];

    if (requested === undefined || requested === null || requested === '') {
      // Fail closed: do not inject a default (Express 5 `req.query` ignores writes).
      throw new ForbiddenException(
        'Cabang wajib disertakan untuk peran Kasir.',
      );
    }

    if (requested !== user.branchId) {
      throw new ForbiddenException(OTHER_BRANCH_FORBIDDEN);
    }

    return true;
  }
}
