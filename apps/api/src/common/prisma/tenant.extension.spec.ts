/**
 * ADR-025 Fase 2 — the tenant extension's contract, asserted without a database.
 *
 * `applyTenantScope` is the rule itself, called directly, so these tests
 * measure exactly one thing: what the extension does to `args` before Prisma
 * ever sees them. The isolation that matters end-to-end is
 * `test/tenant-isolation.e2e-spec.ts`'s job; this file is the fast guard on the
 * rule itself.
 */
import { runWithTenant } from './tenant-context';
import {
  applyTenantScope,
  PLATFORM_MODELS,
  TenantContextMissingError,
} from './tenant.extension';

type QueryArgs = Record<string, unknown>;

/** The args the extension would hand to Prisma for this call. */
const runHook = (
  model: string,
  operation: string,
  args: QueryArgs,
): QueryArgs => applyTenantScope(model, operation, args);

const TENANT = '11111111-1111-4111-8111-111111111111';

describe('tenantExtension', () => {
  describe('with no tenant in scope', () => {
    it('throws on a read of a tenant-scoped model rather than reading everything', () => {
      expect(() => runHook('Sale', 'findMany', {})).toThrow(
        TenantContextMissingError,
      );
    });

    it('throws on a write of a tenant-scoped model', () => {
      expect(() => runHook('Sale', 'create', { data: { total: 1 } })).toThrow(
        TenantContextMissingError,
      );
    });

    it('lets the three platform models through untouched', () => {
      for (const model of PLATFORM_MODELS) {
        expect(runHook(model, 'findMany', { where: { a: 1 } })).toEqual({
          where: { a: 1 },
        });
      }
    });
  });

  describe('with a tenant in scope', () => {
    const scoped = <T>(fn: () => T) => runWithTenant(TENANT, fn);

    it('narrows the where of every read', () => {
      expect(scoped(() => runHook('Sale', 'findMany', {}))).toEqual({
        where: { tenantId: TENANT },
      });
    });

    it('keeps the caller filters and adds the tenant alongside them', () => {
      expect(
        scoped(() => runHook('Sale', 'findUnique', { where: { id: 'abc' } })),
      ).toEqual({ where: { id: 'abc', tenantId: TENANT } });
    });

    it('narrows destructive operations too — not only reads', () => {
      for (const operation of [
        'update',
        'updateMany',
        'delete',
        'deleteMany',
      ]) {
        expect(
          scoped(() => runHook('Sale', operation, { where: { id: 'abc' } })),
        ).toMatchObject({ where: { id: 'abc', tenantId: TENANT } });
      }
    });

    it('narrows aggregates, which are how a report would leak', () => {
      for (const operation of ['count', 'aggregate', 'groupBy']) {
        expect(scoped(() => runHook('Sale', operation, {}))).toMatchObject({
          where: { tenantId: TENANT },
        });
      }
    });

    it('stamps the tenant onto a create', () => {
      expect(
        scoped(() => runHook('Sale', 'create', { data: { totalAmount: 1 } })),
      ).toEqual({ data: { totalAmount: 1, tenantId: TENANT } });
    });

    it('stamps every row of a createMany, not just the first', () => {
      expect(
        scoped(() =>
          runHook('SaleItem', 'createMany', { data: [{ a: 1 }, { b: 2 }] }),
        ),
      ).toEqual({
        data: [
          { a: 1, tenantId: TENANT },
          { b: 2, tenantId: TENANT },
        ],
      });
    });

    it('covers both halves of an upsert', () => {
      expect(
        scoped(() =>
          runHook('Category', 'upsert', {
            where: { id: 'abc' },
            create: { name: 'x' },
            update: { name: 'y' },
          }),
        ),
      ).toEqual({
        where: { id: 'abc', tenantId: TENANT },
        create: { name: 'x', tenantId: TENANT },
        update: { name: 'y' },
      });
    });

    it('leaves an explicit tenantId alone, which is how a new tenant is seeded', () => {
      const other = '22222222-2222-4222-8222-222222222222';
      expect(
        scoped(() =>
          runHook('Branch', 'create', { data: { name: 'x', tenantId: other } }),
        ),
      ).toEqual({ data: { name: 'x', tenantId: other } });
    });

    it('does not mutate the caller-supplied args object', () => {
      const args = { where: { id: 'abc' } };
      scoped(() => runHook('Sale', 'findMany', args));
      expect(args).toEqual({ where: { id: 'abc' } });
    });
  });
});

describe('tenantExtension — nested writes', () => {
  const TENANT = '11111111-1111-4111-8111-111111111111';
  const scoped = <T>(fn: () => T) => runWithTenant(TENANT, fn);

  it('stamps children created through a relation, not just the parent', () => {
    expect(
      scoped(() =>
        applyTenantScope('Product', 'create', {
          data: {
            name: 'Kopi',
            recipeItems: { create: [{ rawMaterialId: 'r1' }] },
          },
        }),
      ),
    ).toEqual({
      data: {
        name: 'Kopi',
        tenantId: TENANT,
        recipeItems: { create: [{ rawMaterialId: 'r1', tenantId: TENANT }] },
      },
    });
  });

  it('handles a single nested create object as well as an array', () => {
    expect(
      scoped(() =>
        applyTenantScope('Sale', 'create', {
          data: { items: { create: { productId: 'p1' } } },
        }),
      ),
    ).toEqual({
      data: {
        tenantId: TENANT,
        items: { create: { productId: 'p1', tenantId: TENANT } },
      },
    });
  });

  it('reaches nested createMany, connectOrCreate and upsert', () => {
    expect(
      scoped(() =>
        applyTenantScope('Product', 'create', {
          data: {
            a: { createMany: { data: [{ x: 1 }] } },
            b: { connectOrCreate: { where: { id: 'z' }, create: { y: 2 } } },
            c: { upsert: { where: { id: 'z' }, create: { w: 3 }, update: {} } },
          },
        }),
      ),
    ).toEqual({
      data: {
        tenantId: TENANT,
        a: { createMany: { data: [{ x: 1, tenantId: TENANT }] } },
        b: {
          connectOrCreate: {
            where: { id: 'z' },
            create: { y: 2, tenantId: TENANT },
          },
        },
        c: {
          upsert: {
            where: { id: 'z' },
            create: { w: 3, tenantId: TENANT },
            update: {},
          },
        },
      },
    });
  });

  it('leaves connect/disconnect/delete alone — those rows already have a tenant', () => {
    expect(
      scoped(() =>
        applyTenantScope('Sale', 'update', {
          where: { id: 's1' },
          data: { items: { deleteMany: {}, connect: { id: 'x' } } },
        }),
      ),
    ).toEqual({
      where: { id: 's1', tenantId: TENANT },
      data: { items: { deleteMany: {}, connect: { id: 'x' } } },
    });
  });

  it('does not mistake a Date for a nested write', () => {
    const soldAt = new Date('2026-01-01T00:00:00.000Z');
    expect(
      scoped(() => applyTenantScope('Sale', 'create', { data: { soldAt } })),
    ).toEqual({ data: { soldAt, tenantId: TENANT } });
  });
});
