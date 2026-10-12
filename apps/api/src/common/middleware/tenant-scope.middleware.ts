import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { tenantStorage } from '../prisma/tenant-context';

/** Opens an empty tenant scope per request; `JwtAuthGuard` fills it in. */
@Injectable()
export class TenantScopeMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    tenantStorage.run({ tenantId: null, platformAdminId: null }, next);
  }
}
