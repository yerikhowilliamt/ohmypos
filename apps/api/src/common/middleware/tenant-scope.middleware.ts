import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { tenantStorage } from '../prisma/tenant-context';

/**
 * Opens an empty request scope for every request (ADR-025 Fase 2). It cannot
 * know the tenant yet — that needs the authenticated user, which only
 * `JwtAuthGuard` has — so it opens the box and the guard puts the value in.
 *
 * A request that never reaches the guard therefore keeps `tenantId: null`, and
 * the Prisma extension throws rather than reading across tenants.
 */
@Injectable()
export class TenantScopeMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    tenantStorage.run({ tenantId: null, platformAdminId: null }, next);
  }
}
