import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request scope. Mutable on purpose: the middleware opens it and the guard
 * fills it in later (ADR-025 Decision 2).
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
 * The current tenant id, for raw SQL.
 *
 * @throws Error when no tenant is in scope.
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

/** Sets the tenant on the open request scope; a no-op outside one. */
export function adoptTenantScope(tenantId: string): void {
  const scope = tenantStorage.getStore();
  if (scope) {
    scope.tenantId = tenantId;
  }
}

export function currentPlatformAdminId(): string | null {
  return tenantStorage.getStore()?.platformAdminId ?? null;
}

/** Enters a tenant scope for the rest of the execution context. Scripts only. */
export function enterTenantScope(tenantId: string): void {
  tenantStorage.enterWith({ tenantId, platformAdminId: null });
}

/** Runs `fn` inside a tenant scope, for work outside a request. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId, platformAdminId: null }, fn);
}
