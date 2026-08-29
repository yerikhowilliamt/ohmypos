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
 * Enforces branch scoping for KASIR (ADR-011 §4, Playbook §8).
 *
 * - `KASIR` — the request's target branch must equal the user's own `branchId`.
 *   On a read where no branch was supplied, the user's branch is injected into
 *   the query, so a cashier listing data cannot see another branch by omission.
 * - `ADMIN` / `OWNER` — pass through unscoped; both have all-branch access.
 *
 * The endpoint states where its branch id lives via `@BranchScoped(...)`.
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

    // ADMIN and OWNER are unscoped — the ADR draws no distinction between them
    // for branch access, only for the specific actions RoleGuard covers.
    if (user.role !== 'KASIR') {
      return true;
    }

    if (!user.branchId) {
      // Should be impossible (ADR-011 §2), but a KASIR without a branch must
      // never fall through to unscoped access.
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
      // Fail closed. An earlier version injected the cashier's own branch here,
      // but Express 5 exposes `req.query` as a getter, so the mutation silently
      // did nothing and the request went through unscoped — a cashier could see
      // every branch. Requiring the value explicitly cannot fail that way.
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
