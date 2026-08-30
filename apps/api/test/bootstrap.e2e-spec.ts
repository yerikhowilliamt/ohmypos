import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  PURCHASE_CATEGORY_NAME,
  SALE_CATEGORY_NAME,
  ensureSystemRefs,
} from '../src/common/system-refs';
import { runWithTenant } from '../src/common/prisma/tenant-context';
import { resetDatabase } from './reset-database';
import { tenantFixture } from './tenant-fixture';

/**
 * `scripts/create-owner.ts` — the only non-demo provisioning path — used to
 * create the OWNER row and nothing else. The system branch and the two system
 * categories existed only in `prisma/seed.ts`, so a real installation failed
 * its FIRST sale and its FIRST central purchase with a 503 reading
 * "Konfigurasi sistem belum lengkap". It was never caught because every test
 * and every dev session runs on the demo seed, which happens to create them.
 */
describe('Bootstrap — ensureSystemRefs (e2e)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let tenantId: string;

  /**
   * ADR-025 — `ensureSystemRefs` resolves the system category by
   * `(tenantId, name)` from the request scope, so these tests have to supply
   * one. `runWithTenant` works here where the client-level binding does not:
   * the scope is opened inside the test body itself.
   */
  const asTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenant(tenantId, fn);

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    ({ prisma, tenantId } = await tenantFixture(moduleFixture));
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await moduleFixture.close();
  });

  it('creates the system location and both system categories from empty', async () => {
    await asTenant(() => ensureSystemRefs(prisma));

    const system = await prisma.branch.findFirst({ where: { isSystem: true } });
    expect(system).not.toBeNull();
    expect(system?.name).toBe('Umum');
    // The system location is a scope, not a store — it is never the main store.
    expect(system?.isMainStore).toBe(false);

    const categories = await prisma.category.findMany({
      where: { name: { in: [PURCHASE_CATEGORY_NAME, SALE_CATEGORY_NAME] } },
      orderBy: { name: 'asc' },
    });
    expect(categories.map((c) => [c.name, c.type])).toEqual([
      [PURCHASE_CATEGORY_NAME, 'OUTFLOW'],
      [SALE_CATEGORY_NAME, 'INFLOW'],
    ]);
  });

  it('is idempotent — a second run creates nothing', async () => {
    await asTenant(() => ensureSystemRefs(prisma));
    await asTenant(() => ensureSystemRefs(prisma));

    expect(await prisma.branch.count({ where: { isSystem: true } })).toBe(1);
    expect(
      await prisma.category.count({
        where: { name: { in: [PURCHASE_CATEGORY_NAME, SALE_CATEGORY_NAME] } },
      }),
    ).toBe(2);
  });

  it('does not create a second system row after the first has been renamed', async () => {
    await asTenant(() => ensureSystemRefs(prisma));
    await prisma.branch.updateMany({
      where: { isSystem: true },
      data: { name: 'Biaya Bersama' },
    });

    // The trap this guards: an upsert keyed on the NAME would not find the
    // renamed row, would insert a second system row, and would then be rejected
    // outright by the `branches_single_system` partial unique index.
    await asTenant(() => ensureSystemRefs(prisma));

    const rows = await prisma.branch.findMany({ where: { isSystem: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Biaya Bersama');
  });
});
