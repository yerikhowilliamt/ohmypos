import { SetMetadata } from '@nestjs/common';

/** Skips `JwtAuthGuard`. Platform routes still need `PlatformAuthGuard`. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
