import { Prisma } from '../../generated/prisma/client';
import { currentTenantId } from './tenant-context';

/** A tenant-scoped model was touched with no tenant in scope (a programming error). */
export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context missing for ${model}.${operation}. A tenant-scoped query ran outside a request scope — use UnscopedPrismaService deliberately, or wrap the call in runWithTenant().`,
    );
    this.name = 'TenantContextMissingError';
  }
}

/** Models without `tenant_id`. Every other model is scoped by default. */
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

/** Nested-write verbs that insert rows; the others address existing rows. */
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
    // Re-typed so `any[]` from Array.isArray does not leak out.
    const rows: unknown[] = value;
    return rows.map((row) =>
      isPlainObject(row) ? withTenant(row, tenantId) : row,
    );
  }
  return isPlainObject(value) ? withTenant(value, tenantId) : value;
}

/**
 * Stamps the tenant onto nested relation creates. A nested write is detected
 * structurally: a plain object carrying one of `NESTED_CREATE_VERBS`.
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
  // An explicit tenantId wins (used when provisioning a new tenant).
  return 'tenantId' in nested || 'tenant' in nested
    ? nested
    : { ...nested, tenantId };
}

/**
 * Returns the args Prisma should run: `where` narrowed and `data` stamped with
 * the current tenant. Pure, so it is unit-testable.
 *
 * @throws TenantContextMissingError
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
 * Applies `applyTenantScope` to every model and operation (ADR-025 Decision 1).
 * Does not cover `$queryRaw` / `$executeRaw`.
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

/** The same rule bound to a fixed tenant id, for code outside a request scope (e2e fixtures). */
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
