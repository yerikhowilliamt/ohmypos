import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

/**
 * OhMyPos — Phase 14 Workstream C volume seeder (plan §6.1 Option 1).
 *
 * Exists ONLY to time report queries against realistic volume. It writes
 * directly via `createMany`, bypassing every service (`SalesService`,
 * `StockMovementsService`, ...) — the report endpoints under test
 * (`/reports/*`, `/inventory/summary`) only ever read `sales`, `sale_items`,
 * `ledger_entries` and `stock_movements`, so this is a correct shortcut for
 * that purpose. `RawMaterial.currentStock` will NOT reconcile against the
 * movement ledger in this database, because nothing here goes through the
 * single-writer path (ADR-007). That is intentional and this database must
 * NEVER be used for anything except timing queries.
 *
 * HARD GUARD: refuses to run unless DATABASE_URL's database name ends in
 * `_volume`. This script deletes nothing on its own, but a `--months=36`
 * run inserts ~1.2M rows — pointed at the wrong database, that is not a
 * mistake you undo with a single DELETE.
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !/\/[A-Za-z0-9_]*_volume(?:\?|$)/.test(DATABASE_URL)) {
  throw new Error(
    'seed-volume.ts refused to run: DATABASE_URL must point at a database ' +
      'whose name ends in "_volume". This script writes hundreds of ' +
      'thousands of synthetic rows and must never touch ohmypos_db or ' +
      'ohmypos_e2e.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const monthsArg = process.argv.find((a) => a.startsWith('--months='));
const MONTHS = monthsArg ? Number(monthsArg.split('=')[1]) : 12;
if (!Number.isInteger(MONTHS) || MONTHS < 1 || MONTHS > 60) {
  throw new Error(
    `--months must be an integer between 1 and 60, got: ${monthsArg}`,
  );
}

const BATCH_SIZE = 5000;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

function money(n: number): string {
  return n.toFixed(2);
}

function qty(n: number): string {
  return n.toFixed(4);
}

interface ProductFixture {
  id: string;
  sellPrice: number;
  hpp: number;
  recipe: Array<{ rawMaterialId: string; quantityUsed: number }>;
}

async function ensureMasterData() {
  await prisma.branch.upsert({
    where: { name: 'Pusat (Dapur Sentral)' },
    update: {},
    create: { name: 'Pusat (Dapur Sentral)' },
  });

  const branchNames = ['Volume Cabang A', 'Volume Cabang B', 'Volume Cabang C'];
  const branches = await Promise.all(
    branchNames.map((name) =>
      prisma.branch.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );

  // Account.name has no unique constraint (unlike Branch/Category/Supplier),
  // so these are pinned to literal ids, same pattern as prisma/seed.ts.
  const accountDefs = [
    {
      id: '00000000-0000-4000-9000-000000000001',
      name: 'Volume Kas Tunai',
      type: 'CASH' as const,
    },
    {
      id: '00000000-0000-4000-9000-000000000002',
      name: 'Volume Bank',
      type: 'BANK' as const,
    },
    {
      id: '00000000-0000-4000-9000-000000000003',
      name: 'Volume QRIS',
      type: 'EWALLET' as const,
    },
  ];
  const accounts = await Promise.all(
    accountDefs.map((a) =>
      prisma.account.upsert({
        where: { id: a.id },
        update: {},
        create: { id: a.id, name: a.name, type: a.type, openingBalance: '0' },
      }),
    ),
  );

  const salesCategory = await prisma.category.upsert({
    where: { name: 'Penjualan' },
    update: {},
    create: { name: 'Penjualan', type: 'INFLOW' },
  });
  await prisma.category.upsert({
    where: { name: 'Pembelian Bahan Baku' },
    update: {},
    create: { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' },
  });

  // Fixed bcrypt hash of "VolumeTest123!" — for logging into the volume
  // database's server instance to time /reports/* and /inventory/summary
  // over real HTTP (plan §6.3). Never used outside this disposable database.
  const ownerPasswordHash =
    '$2b$10$iPE0aB1eqchEKk2CjqPtCeDMpbZrLu/xxA0UUXnffNnUEe3Kczn.2';
  await prisma.user.upsert({
    where: { email: 'volume-owner@test.local' },
    update: {},
    create: {
      name: 'Volume Owner',
      email: 'volume-owner@test.local',
      passwordHash: ownerPasswordHash,
      role: 'OWNER',
    },
  });

  const userEmail = 'volume-kasir@test.local';
  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: { branchId: branches[0].id },
    create: {
      name: 'Volume Kasir',
      email: userEmail,
      passwordHash: '$2b$10$invalidNotUsedForLogin.......................',
      role: 'KASIR',
      branchId: branches[0].id,
    },
  });

  const materialDefs = [
    { name: 'Volume Kopi', unit: 'kg', unitCost: 120000 },
    { name: 'Volume Susu', unit: 'liter', unitCost: 18000 },
    { name: 'Volume Gula', unit: 'kg', unitCost: 14000 },
    { name: 'Volume Teh', unit: 'kg', unitCost: 90000 },
    { name: 'Volume Coklat', unit: 'kg', unitCost: 60000 },
  ];
  const materials = await Promise.all(
    materialDefs.map((m) =>
      prisma.rawMaterial.upsert({
        where: { name: m.name },
        update: {},
        create: {
          name: m.name,
          unit: m.unit,
          unitCost: money(m.unitCost),
          currentStock: '999999.0000',
        },
      }),
    ),
  );
  const byName = new Map(materials.map((m) => [m.name, m]));

  const productDefs: Array<{
    name: string;
    sellPrice: number;
    recipe: Array<{ material: string; qty: number }>;
  }> = [
    {
      name: 'Volume Kopi Susu',
      sellPrice: 25000,
      recipe: [
        { material: 'Volume Kopi', qty: 0.02 },
        { material: 'Volume Susu', qty: 0.15 },
        { material: 'Volume Gula', qty: 0.015 },
      ],
    },
    {
      name: 'Volume Teh Manis',
      sellPrice: 10000,
      recipe: [
        { material: 'Volume Teh', qty: 0.01 },
        { material: 'Volume Gula', qty: 0.025 },
      ],
    },
    {
      name: 'Volume Coklat Susu',
      sellPrice: 22000,
      recipe: [
        { material: 'Volume Coklat', qty: 0.03 },
        { material: 'Volume Susu', qty: 0.15 },
      ],
    },
    {
      name: 'Volume Kopi Hitam',
      sellPrice: 15000,
      recipe: [{ material: 'Volume Kopi', qty: 0.02 }],
    },
    {
      name: 'Volume Susu Coklat',
      sellPrice: 18000,
      recipe: [
        { material: 'Volume Susu', qty: 0.2 },
        { material: 'Volume Coklat', qty: 0.02 },
      ],
    },
    {
      name: 'Volume Teh Tawar',
      sellPrice: 8000,
      recipe: [{ material: 'Volume Teh', qty: 0.01 }],
    },
  ];

  const products: ProductFixture[] = [];
  for (const def of productDefs) {
    const product = await prisma.product.upsert({
      where: { name: def.name },
      update: {},
      create: { name: def.name, sellPrice: money(def.sellPrice) },
    });

    const recipe = def.recipe.map((r) => ({
      rawMaterialId: byName.get(r.material)!.id,
      quantityUsed: r.qty,
    }));
    for (const r of recipe) {
      await prisma.recipeItem.upsert({
        where: {
          productId_rawMaterialId: {
            productId: product.id,
            rawMaterialId: r.rawMaterialId,
          },
        },
        update: { quantityUsed: qty(r.quantityUsed) },
        create: {
          productId: product.id,
          rawMaterialId: r.rawMaterialId,
          quantityUsed: qty(r.quantityUsed),
        },
      });
    }

    const hpp = recipe.reduce((sum, r) => {
      const material = materials.find((m) => m.id === r.rawMaterialId)!;
      return sum + r.quantityUsed * Number(material.unitCost);
    }, 0);

    products.push({ id: product.id, sellPrice: def.sellPrice, hpp, recipe });
  }

  return {
    branches,
    accounts,
    user,
    products,
    salesCategoryId: salesCategory.id,
  };
}

async function main() {
  console.log(
    `seed-volume: target database = ${new URL(DATABASE_URL!).pathname.slice(1)}, months = ${MONTHS}`,
  );

  const { branches, accounts, user, products, salesCategoryId } =
    await ensureMasterData();

  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1); // yesterday — never today/future
  endDate.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setUTCMonth(startDate.getUTCMonth() - MONTHS);

  let saleBatch: Prisma.SaleCreateManyInput[] = [];
  let saleItemBatch: Prisma.SaleItemCreateManyInput[] = [];
  let ledgerBatch: Prisma.LedgerEntryCreateManyInput[] = [];
  let movementBatch: Prisma.StockMovementCreateManyInput[] = [];

  let totalSales = 0;
  let totalSaleItems = 0;
  let totalMovements = 0;
  const startedAt = Date.now();

  async function flush(force = false) {
    if (!force && saleBatch.length < BATCH_SIZE) return;
    if (saleBatch.length === 0) return;

    // LedgerEntry before Sale: Sale.ledgerEntryId is a required FK.
    await prisma.ledgerEntry.createMany({ data: ledgerBatch });
    await prisma.sale.createMany({ data: saleBatch });
    await prisma.saleItem.createMany({ data: saleItemBatch });
    await prisma.stockMovement.createMany({ data: movementBatch });

    totalSales += saleBatch.length;
    totalSaleItems += saleItemBatch.length;
    totalMovements += movementBatch.length;

    saleBatch = [];
    saleItemBatch = [];
    ledgerBatch = [];
    movementBatch = [];

    const elapsedSec = (Date.now() - startedAt) / 1000;
    console.log(
      `  ${totalSales} sales, ${totalSaleItems} sale_items, ${totalMovements} stock_movements (${elapsedSec.toFixed(1)}s)`,
    );
  }

  for (
    let day = new Date(startDate);
    day <= endDate;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    for (const branch of branches) {
      const salesToday = randInt(100, 140);

      for (let i = 0; i < salesToday; i++) {
        const soldAt = new Date(day);
        soldAt.setUTCHours(randInt(7, 21), randInt(0, 59), randInt(0, 59));

        const account = pick(accounts);
        const saleId = randomUUID();
        const ledgerEntryId = randomUUID();

        const lineCount = randInt(1, 4);
        let totalAmount = 0;

        for (let l = 0; l < lineCount; l++) {
          const product = pick(products);
          const quantity = randInt(1, 3);
          const lineTotal = product.sellPrice * quantity;
          totalAmount += lineTotal;

          saleItemBatch.push({
            id: randomUUID(),
            saleId,
            productId: product.id,
            quantity: qty(quantity),
            unitPriceAtSale: money(product.sellPrice),
            isPriceOverridden: false,
            hppAtSale: money(product.hpp),
            lineTotal: money(lineTotal),
          });

          for (const r of product.recipe) {
            movementBatch.push({
              id: randomUUID(),
              rawMaterialId: r.rawMaterialId,
              branchId: branch.id,
              direction: 'OUT',
              quantity: qty(r.quantityUsed * quantity),
              referenceType: 'SALE',
              referenceId: saleId,
              unitCostAtMovement: money(product.hpp),
              movementDate: soldAt,
            });
          }
        }

        ledgerBatch.push({
          id: ledgerEntryId,
          accountId: account.id,
          categoryId: salesCategoryId,
          branchId: branch.id,
          entryDate: soldAt,
          amount: money(totalAmount),
          type: 'INFLOW',
          sourceType: 'SALE',
          sourceId: saleId,
        });

        saleBatch.push({
          id: saleId,
          branchId: branch.id,
          accountId: account.id,
          userId: user.id,
          ledgerEntryId,
          totalAmount: money(totalAmount),
          soldAt,
        });

        if (saleBatch.length >= BATCH_SIZE) {
          await flush();
        }
      }
    }
  }

  await flush(true);

  console.log(
    `seed-volume: done. ${totalSales} sales, ${totalSaleItems} sale_items, ${totalMovements} stock_movements in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
