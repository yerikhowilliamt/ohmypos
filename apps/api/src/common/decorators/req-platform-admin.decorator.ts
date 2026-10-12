import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformJwtPayload } from '../types/platform-jwt-payload.interface';

/** The platform admin set by `PlatformAuthGuard`; the counterpart of `@ReqUser()`. */
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
