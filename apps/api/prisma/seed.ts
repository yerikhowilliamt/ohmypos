import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { LedgerEntriesService } from '../src/modules/ledger-entries/ledger-entries.service';
import { PayablesService } from '../src/modules/payables/payables.service';
import { StockMovementsService } from '../src/modules/stock-movements/stock-movements.service';
import { SupplierPurchasesService } from '../src/modules/supplier-purchases/supplier-purchases.service';

/**
 * Synthetic seed data only — fictional branches and staff, never anything from
 * the real business (Handbook §6).
 *
 * Load-bearing entities:
 *  - the initial OWNER (ADR-011 §5);
 *  - system categories (ADR-012);
 *  - system branch `Pusat (Dapur Sentral)` (ADR-014);
 *  - Phase 4 purchasing fixtures per §9.9 for hand verification and e2e testing.
 *
 * The Phase 4 fixtures go through `SupplierPurchasesService` and
 * `PayablesService` rather than writing rows directly (plan §9.9). That is not
 * ceremony: `remainingBalance`, `paymentStatus` and `RawMaterial.currentStock`
 * are denormalized balances whose correctness rests on having exactly ONE
 * writer each (plan §2 Option B). A seed that wrote them by hand would be a
 * second writer, and — because it lives outside `apps/api/src` — one that the
 * single-writer greps in the definition of done cannot see. Hand-computing
 * `40000.00` here would also silently desync the moment a settlement amount
 * changed. Every derived figure below is produced by the same code the API
 * runs; only the inputs are literals.
 *
 * The services are constructed directly instead of booting a Nest container:
 * they are plain classes, and `PrismaService` builds its own driver adapter
 * from `DATABASE_URL`, so manual wiring exercises the identical code path
 * without pulling in pino, throttling and config for a script.
 */
async function main() {
  const prisma = new PrismaService();

  const stockMovementsService = new StockMovementsService();
  const ledgerEntriesService = new LedgerEntriesService(prisma);
  const supplierPurchasesService = new SupplierPurchasesService(
    prisma,
    stockMovementsService,
    ledgerEntriesService,
  );
  const payablesService = new PayablesService(prisma, ledgerEntriesService);

  // System central branch (ADR-014) — required for central purchase ledger entry
  // attribution. Not captured in a variable on purpose: the services resolve it
  // by its unique name via `resolveLedgerBranchId`, and nothing here should be
  // tempted to pass its id around as if it were an ordinary branch.
  await prisma.branch.upsert({
    where: { name: 'Pusat (Dapur Sentral)' },
    update: {},
    create: {
      name: 'Pusat (Dapur Sentral)',
      address: 'Dapur Sentral',
    },
  });

  const branches = await Promise.all(
    ['Cabang Melati', 'Cabang Kenanga'].map((name) =>
      prisma.branch.upsert({
        where: { name },
        update: {},
        create: { name, address: `Jl. ${name} No. 1` },
      }),
    ),
  );

  const [kasTunai, bankUtama] = await Promise.all([
    prisma.account.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Kas Tunai',
        type: 'CASH',
        openingBalance: '0',
      },
    }),
    prisma.account.upsert({
      where: { id: '00000000-0000-4000-8000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Bank Utama',
        type: 'BANK',
        openingBalance: '0',
      },
    }),
  ]);

  // Required by ADR-012: system-generated ledger entries must have a category.
  // Resolved by name inside the services (`resolvePurchaseCategoryId`), so no
  // id is captured here either.
  await Promise.all(
    [
      { name: 'Penjualan', type: 'INFLOW' as const },
      { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' as const },
      { name: 'Operasional', type: 'OUTFLOW' as const },
    ].map((category) =>
      prisma.category.upsert({
        where: { name: category.name },
        update: {},
        create: category,
      }),
    ),
  );

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@ohmypos.local';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      name: 'Pemilik',
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPassword, 10),
      role: 'OWNER',
      branchId: null,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@ohmypos.local' },
    update: {},
    create: {
      name: 'Admin Rekonsiliasi',
      email: 'admin@ohmypos.local',
      passwordHash: await bcrypt.hash('ChangeMe123!', 10),
      role: 'ADMIN',
      branchId: null,
    },
  });

  await prisma.user.upsert({
    where: { email: 'kasir@ohmypos.local' },
    update: {},
    create: {
      name: 'Kasir Melati',
      email: 'kasir@ohmypos.local',
      passwordHash: await bcrypt.hash('ChangeMe123!', 10),
      role: 'KASIR',
      branchId: branches[0].id,
    },
  });

  // Master Data fixtures per §9.8 — hand-checkable numbers for HPP calculation and e2e testing.
  const gula = await prisma.rawMaterial.upsert({
    where: { name: 'Gula' },
    update: {},
    create: {
      name: 'Gula',
      unit: 'kg',
      unitCost: '12000.00',
      currentStock: '10.0000',
      lowStockThreshold: '2.0000',
    },
  });

  const kopi = await prisma.rawMaterial.upsert({
    where: { name: 'Kopi' },
    update: {},
    create: {
      name: 'Kopi',
      unit: 'kg',
      unitCost: '85000.00',
      currentStock: '5.0000',
      lowStockThreshold: '1.0000',
    },
  });

  const esKopiSusu = await prisma.product.upsert({
    where: { name: 'Es Kopi Susu' },
    update: {},
    create: {
      name: 'Es Kopi Susu',
      sellPrice: '18000.00',
      isActive: true,
    },
  });

  await prisma.recipeItem.upsert({
    where: {
      productId_rawMaterialId: {
        productId: esKopiSusu.id,
        rawMaterialId: gula.id,
      },
    },
    update: { quantityUsed: '0.2500' },
    create: {
      productId: esKopiSusu.id,
      rawMaterialId: gula.id,
      quantityUsed: '0.2500',
    },
  });

  await prisma.recipeItem.upsert({
    where: {
      productId_rawMaterialId: {
        productId: esKopiSusu.id,
        rawMaterialId: kopi.id,
      },
    },
    update: { quantityUsed: '0.0180' },
    create: {
      productId: esKopiSusu.id,
      rawMaterialId: kopi.id,
      quantityUsed: '0.0180',
    },
  });

  // Product with no recipe (§9.8) to exercise null-path HPP case
  await prisma.product.upsert({
    where: { name: 'Air Mineral' },
    update: {},
    create: {
      name: 'Air Mineral',
      sellPrice: '5000.00',
      isActive: true,
    },
  });

  // ---------------------------------------------------------------------------
  // Phase 4: Suppliers, Purchases, Payables, Settlements & StockMovements (§9.9)
  // ---------------------------------------------------------------------------
  const supplierSumberRejeki = await prisma.supplier.upsert({
    where: { name: 'Toko Sumber Rejeki' },
    update: {},
    create: {
      name: 'Toko Sumber Rejeki',
      contact: '0812-1111-2222',
    },
  });

  const supplierKopiNusantara = await prisma.supplier.upsert({
    where: { name: 'CV Kopi Nusantara' },
    update: {},
    create: {
      name: 'CV Kopi Nusantara',
      contact: '0813-3333-4444',
    },
  });

  // Purchase A — Central, PAID (CV Kopi Nusantara, branchId = null, paid from Bank Utama)
  // Kopi 2.0000 × 85000.00 = 170000.00
  // Gula 10.0000 × 12000.00 = 120000.00
  // Total: 290000.00
  const existingPurchaseA = await prisma.supplierPurchase.findFirst({
    where: {
      supplierId: supplierKopiNusantara.id,
      branchId: null,
    },
  });

  if (!existingPurchaseA) {
    // PAID up front, so the service creates the OUTFLOW LedgerEntry immediately
    // and no Payable at all (ADR-006). Being central, that entry is attributed
    // to `Pusat (Dapur Sentral)` by `resolveLedgerBranchId` (ADR-014).
    await supplierPurchasesService.create({
      supplierId: supplierKopiNusantara.id,
      branchId: null,
      purchaseDate: '2026-08-16T10:00:00.000Z',
      paymentStatus: 'PAID',
      accountId: bankUtama.id,
      note: 'Pembelian bahan baku pusat',
      items: [
        {
          rawMaterialId: kopi.id,
          quantity: '2.0000',
          unitCost: '85000.00',
        },
        {
          rawMaterialId: gula.id,
          quantity: '10.0000',
          unitCost: '12000.00',
        },
      ],
    });
  }

  // Purchase B — Branch-scoped (Cabang Melati), UNPAID -> Settle 20,000.00 partial from Kas Tunai
  // Gula 5.0000 × 12000.00 = 60000.00
  const existingPurchaseB = await prisma.supplierPurchase.findFirst({
    where: {
      supplierId: supplierSumberRejeki.id,
      branchId: branches[0].id,
    },
  });

  if (!existingPurchaseB) {
    // UNPAID, so the service creates a Payable and deliberately NO LedgerEntry
    // (ADR-006) — this fixture is what makes that asymmetry visible by hand.
    const purchaseB = await supplierPurchasesService.create({
      supplierId: supplierSumberRejeki.id,
      branchId: branches[0].id,
      purchaseDate: '2026-08-16T11:00:00.000Z',
      paymentStatus: 'UNPAID',
      note: 'Pembelian bahan baku cabang (utang)',
      items: [
        {
          rawMaterialId: gula.id,
          quantity: '5.0000',
          unitCost: '12000.00',
        },
      ],
    });

    // Partial settlement — the service derives remainingBalance (60000 − 20000),
    // moves the payable to PARTIALLY_SETTLED, the purchase to PARTIALLY_PAID,
    // and writes the settlement's OUTFLOW entry. None of those are literals here.
    await payablesService.settle(purchaseB.payableId!, {
      accountId: kasTunai.id,
      amount: '20000.00',
      settledAt: '2026-08-16T14:00:00.000Z',
      note: 'Cicilan 1',
    });
  }

  console.log(`Seeded. Owner login: ${ownerEmail}`);
  await prisma.$disconnect();
}

void main();
