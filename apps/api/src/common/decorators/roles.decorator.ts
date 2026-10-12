import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@ohmypos/api-contracts';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may call an endpoint; enforced by `RoleGuard`.
 *
 * @example @Roles('OWNER')            // user creation, ADR-011 §5
 * @example @Roles('ADMIN', 'OWNER')   // reconciliation matching, ADR-011 §6
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
