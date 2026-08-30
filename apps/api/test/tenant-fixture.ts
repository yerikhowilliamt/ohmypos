import {
  PrismaService,
  UnscopedPrismaService,
} from '../src/common/prisma/prisma.service';
import { tenantBoundExtension } from '../src/common/prisma/tenant.extension';

/**
 * ADR-025 — the single tenant every e2e suite writes its fixtures into.
 *
 * Suites cannot use the request-scoped `PrismaService` directly: the tenant
 * lives in an AsyncLocalStorage scope opened per HTTP request, and Jest calls
 * `beforeAll` and each `it` from sibling async contexts, so a scope entered in
 * a hook is not visible inside the test body. Verified, not assumed.
 *
 * The client returned here is therefore bound to an explicit tenant id while
 * running the exact same filter rule the API runs. Requests made through
 * supertest are unaffected — they go through the middleware and guard as usual,
 * and land on this same tenant because their users were created in it.
 */
export const E2E_TENANT_SLUG = 'e2e';

/**
 * Anything with Nest's DI `get` — an `INestApplication` or a bare
 * `TestingModule`, since `bootstrap.e2e-spec.ts` never builds an app.
 */
export interface DiContainer {
  get<T>(token: new (...args: never[]) => T): T;
}

export interface TenantFixture {
  /** Tenant-bound, behaves like the API's `PrismaService`. */
  prisma: PrismaService;
  /** No tenant filter at all — for cross-tenant assertions and platform rows. */
  unscoped: UnscopedPrismaService;
  tenantId: string;
}

export async function tenantFixture(app: DiContainer): Promise<TenantFixture> {
  const unscoped = app.get(UnscopedPrismaService);
  const tenant = await unscoped.tenant.upsert({
    where: { slug: E2E_TENANT_SLUG },
    update: {},
    create: { name: 'E2E Tenant', slug: E2E_TENANT_SLUG },
  });

  return {
    unscoped,
    tenantId: tenant.id,
    prisma: unscoped.$extends(
      tenantBoundExtension(tenant.id),
    ) as unknown as PrismaService,
  };
}

/** The common case: a suite that only needs the tenant-scoped client. */
export async function tenantScopedPrisma(
  app: DiContainer,
): Promise<PrismaService> {
  return (await tenantFixture(app)).prisma;
}
