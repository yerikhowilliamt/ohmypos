import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformJwtPayload } from '../types/platform-jwt-payload.interface';

/**
 * Reads what `PlatformAuthGuard` published on the request (ADR-025 Fase 3).
 * The mirror of `@ReqUser()`, against a different request property so the two
 * identities can never be confused for one another.
 */
export const ReqPlatformAdmin = createParamDecorator(
  (data: keyof PlatformJwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ platformAdmin?: PlatformJwtPayload }>();
    const admin = request.platformAdmin;
    if (!admin) return null;
    return data ? admin[data] : admin;
  },
);
