import { Prisma } from '../../generated/prisma/client';
import { currentTenantId } from './tenant-context';

/**
 * Thrown when a tenant-scoped model is touched with no tenant in scope.
 *
 * This is a programming error, not a caller error — it means a request reached
 * a service without passing `JwtAuthGuard`, or a script forgot
 * `runWithTenant(...)`. Failing closed is the entire point of the extension:
 * the alternative is a query that quietly reads every tenant's rows.
 */
export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context missing for ${model}.${operation}. A tenant-scoped query ran outside a request scope — use UnscopedPrismaService deliberately, or wrap the call in runWithTenant().`,
    );
    this.name = 'TenantContextMissingError';
  }
}

/**
 * Models with no `tenant_id` column (ADR-025). Everything else is tenant-scoped
 * by default, so a model added later is enforced without anyone remembering to
 * add it here.
 */
export const PLATFORM_MODELS: ReadonlySet<string> = new Set([
  'Tenant',
  'PlatformAdmin',
  'ImpersonationSession',
]);

/** Operations whose `where` must be narrowed to the current tenant. */
const WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'aggregate',
  'count',
  'groupBy',
]);

/** Operations whose `data` must carry the current tenant. */
const DATA_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
]);

type ScopedArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

/**
 * The nested-write verbs that INSERT rows. `connect`, `set`, `disconnect`,
 * `delete` and `update` are absent on purpose: they address rows that already
 * exist, and those already carry a tenant.
 */
const NESTED_CREATE_VERBS = [
  'create',
  'createMany',
  'connectOrCreate',
  'upsert',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function stampRows(value: unknown, tenantId: string): unknown {
  if (Array.isArray(value)) {
    // Re-typed: `Array.isArray` narrows `unknown` to `any[]`, and mapping over
    // that would launder an `any` back out of this function.
    const rows: unknown[] = value;
    return rows.map((row) =>
      isPlainObject(row) ? withTenant(row, tenantId) : row,
    );
  }
  return isPlainObject(value) ? withTenant(value, tenantId) : value;
}

/**
 * Stamps the tenant onto NESTED relation writes.
 *
 * Without this, `product.create({ data: { name, recipeItems: { create: [...] }}})`
 * writes the parent with a tenant and the children with the schema's `@default("")`
 * — which fails on `recipe_items_tenant_id_fkey` rather than landing anywhere,
 * but fails at a call site nowhere near the cause.
 *
 * Relations are detected structurally, not from schema metadata: a value is a
 * nested write iff it is a plain object carrying one of the verbs above. No
 * column in this schema is a JSON object, so nothing else can match.
 */
function stampNestedWrites(
  row: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  let next = row;

  for (const [key, value] of Object.entries(row)) {
    if (!isPlainObject(value)) continue;
    if (!NESTED_CREATE_VERBS.some((verb) => verb in value)) continue;

    const nested: Record<string, unknown> = { ...value };

    if ('create' in nested) {
      nested.create = stampRows(nested.create, tenantId);
    }
    if (isPlainObject(nested.createMany) && 'data' in nested.createMany) {
      nested.createMany = {
        ...nested.createMany,
        data: stampRows(nested.createMany.data, tenantId),
      };
    }
    for (const verb of ['connectOrCreate', 'upsert'] as const) {
      const entry = nested[verb];
      if (entry === undefined) continue;
      const stampOne = (one: unknown) =>
        isPlainObject(one) && isPlainObject(one.create)
          ? { ...one, create: withTenant(one.create, tenantId) }
          : one;
      nested[verb] = Array.isArray(entry)
        ? entry.map(stampOne)
        : stampOne(entry);
    }

    if (next === row) next = { ...row };
    next[key] = nested;
  }

  return next;
}

function withTenant(
  row: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  const nested = stampNestedWrites(row, tenantId);
  // An explicit tenantId already on the payload wins — that is how the platform
  // module seeds a brand-new tenant's system refs before anyone can log in.
  return 'tenantId' in nested || 'tenant' in nested
    ? nested
    : { ...nested, tenantId };
}

/**
 * The whole rule, in one pure function: given a model, an operation and the
 * caller's args, return the args Prisma should actually run.
 *
 * Extracted from the extension because `Prisma.defineExtension` returns an
 * opaque callable, so this is the only way to unit-test the rule itself
 * (`tenant.extension.spec.ts`) without a database.
 */
export function applyTenantScope<T>(
  model: string,
  operation: string,
  args: T,
  resolveTenantId: () => string | null = currentTenantId,
): T {
  if (PLATFORM_MODELS.has(model)) {
    return args;
  }

  const tenantId = resolveTenantId();
  if (!tenantId) {
    throw new TenantContextMissingError(model, operation);
  }

  const incoming = args as ScopedArgs;
  const next: ScopedArgs = { ...incoming };

  if (WHERE_OPERATIONS.has(operation)) {
    next.where = { ...(incoming.where ?? {}), tenantId };
  }

  if (DATA_OPERATIONS.has(operation) && incoming.data !== undefined) {
    next.data = Array.isArray(incoming.data)
      ? incoming.data.map((row) => withTenant(row, tenantId))
      : withTenant(incoming.data, tenantId);
  }

  if (operation === 'upsert' && incoming.create !== undefined) {
    next.create = withTenant(incoming.create, tenantId);
  }

  return next as T;
}

/**
 * ADR-025 Decision 1 — one `$allModels` rule with no per-model branches. The
 * uniform `tenantId` column on all 23 models (child tables included, however
 * redundant that looks) is what makes that possible; a special case here is
 * exactly where an isolation bug would hide.
 *
 * NOT covered, by construction: `$queryRaw` / `$executeRaw`, which the query
 * hook never sees. Those carry hand-written `tenant_id` predicates instead —
 * see `reports.service.ts` and DEBT-051.
 */
export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return query(applyTenantScope(model, operation, args));
      },
    },
  },
});

/**
 * The same rule, but bound to one tenant id instead of reading the request
 * scope.
 *
 * For code that runs OUTSIDE an AsyncLocalStorage context and cannot open one:
 * chiefly e2e fixtures, because Jest invokes `beforeAll` and each `it` from
 * sibling async contexts, so a scope entered in a hook is simply not visible in
 * the test body (verified, not assumed).
 *
 * Deliberately the same `applyTenantScope` the production extension uses — a
 * second, test-only implementation of the filter would be a test that no longer
 * tests the thing that ships.
 */
export function tenantBoundExtension(tenantId: string) {
  return Prisma.defineExtension({
    name: `tenant-scope(${tenantId})`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(
            applyTenantScope(model, operation, args, () => tenantId),
          );
        },
      },
    },
  });
}
