import { SetMetadata } from '@nestjs/common';

/** Marks a route as not requiring authentication. Consumed by the auth guard in Phase 2. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
