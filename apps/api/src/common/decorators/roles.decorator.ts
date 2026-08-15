import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@ohmypos/api-contracts';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may call an endpoint (Playbook §8). Without it, any
 * authenticated role is allowed — the restriction must always be explicit,
 * never inferred from the route name.
 *
 * @example @Roles('OWNER')            // user creation, ADR-011 §5
 * @example @Roles('ADMIN', 'OWNER')   // reconciliation matching, ADR-011 §6
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
