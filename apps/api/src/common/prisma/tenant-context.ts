import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * ADR-025 Decision 2 — the tenant is resolved on the server from the User
 * record, never sent by the client.
 *
 * The store is deliberately MUTABLE. In NestJS middleware always runs before
 * guards, so `TenantScopeMiddleware` opens the scope and `JwtAuthGuard` fills
 * it in once it has read the user from the database. Re-entering
 * `tenantStorage.run(...)` from the guard would close the scope again the
 * moment the guard returned.
 */
export interface RequestScope {
  tenantId: string | null;
  platformAdminId: string | null;
}

export const tenantStorage = new AsyncLocalStorage<RequestScope>();

export function currentTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}

/**
 * For raw SQL, which the Prisma extension never sees. Throws rather than
 * returning null: an unscoped raw query is the failure mode ADR-025 exists to
 * prevent, and a silent one is worse than a 500.
 */
export function requireTenantId(): string {
  const tenantId = currentTenantId();
  if (!tenantId) {
    throw new Error(
      'Raw SQL attempted with no tenant in scope — refusing to run an unscoped query.',
    );
  }
  return tenantId;
}

/**
 * Fills in the tenant on a scope the middleware already opened.
 *
 * Used by `JwtAuthGuard` and by the two `@Public()` auth entry points, which
 * identify their user before any guard could have. A no-op outside a request
 * scope: the Prisma extension is the fail-closed layer, and duplicating that
 * check here would only move the error further from where it matters.
 */
export function adoptTenantScope(tenantId: string): void {
  const scope = tenantStorage.getStore();
  if (scope) {
    scope.tenantId = tenantId;
  }
}

export function currentPlatformAdminId(): string | null {
  return tenantStorage.getStore()?.platformAdminId ?? null;
}

/**
 * Enters a tenant scope for the REST of the current execution context, with no
 * callback to wrap.
 *
 * Scripts only — the seed, `seed-volume`, and `scripts/*`. A request must use
 * the middleware + guard pair instead: `enterWith` has no natural end, which is
 * exactly what makes it wrong for anything concurrent and fine for a script
 * that does one thing and exits.
 */
export function enterTenantScope(tenantId: string): void {
  tenantStorage.enterWith({ tenantId, platformAdminId: null });
}

/**
 * Opens a scope for work that runs outside a request — the seed, the bootstrap
 * scripts, and the platform module when it deliberately acts as one tenant.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId, platformAdminId: null }, fn);
}
