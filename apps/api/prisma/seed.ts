import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  PrismaService,
  UnscopedPrismaService,
} from '../src/common/prisma/prisma.service';
import { enterTenantScope } from '../src/common/prisma/tenant-context';
import { tenantExtension } from '../src/common/prisma/tenant.extension';
import { LedgerEntriesService } from '../src/modules/ledger-entries/ledger-entries.service';
import { PayablesService } from '../src/modules/payables/payables.service';
import { StockMovementsService } from '../src/modules/stock-movements/stock-movements.service';
import { SupplierPurchasesService } from '../src/modules/supplier-purchases/supplier-purchases.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { ensureSystemRefs } from '../src/common/system-refs';

/**
 * Development and e2e fixtures (synthetic data only). Never run against
 * production. Derived figures go through the services; see prisma/README.md.
 */
async function main() {
  // ADR-025 — the tenant and the platform admin exist OUTSIDE any tenant, so
  // they are written with the unscoped client before the scope is opened.
  const unscoped = new UnscopedPrismaService();

  const tenant = await unscoped.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'OhMyPos', slug: 'default' },
  });
  const tenantId = tenant.id;

  const platformAdminEmail =
    process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'platform@ohmypos.local';
  const platformAdminPassword =
    process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await unscoped.platformAdmin.upsert({
    where: { email: platformAdminEmail },
    update: {},
    create: {
      name: 'Platform Operator',
      email: platformAdminEmail,
      passwordHash: await bcrypt.hash(platformAdminPassword, 10),
    },
  });

  // Everything below runs as the default tenant, so the extension supplies
  // `tenantId` on every create and narrows every read — not one of the ~200
  // calls below had to change for it.
  enterTenantScope(tenantId);
  const prisma = unscoped.$extends(
    tenantExtension,
  ) as unknown as PrismaService;

  const stockMovementsService = new StockMovementsService(prisma);
  const ledgerEntriesService = new LedgerEntriesService(prisma);
  const supplierPurchasesService = new SupplierPurchasesService(
    prisma,
    stockMovementsService,
    ledgerEntriesService,
  );
  const payablesService = new PayablesService(prisma, ledgerEntriesService);
  const salesService = new SalesService(
    prisma,
    stockMovementsService,
    ledgerEntriesService,
  );

  // System refs via the production bootstrap function, so the two cannot drift.
  await ensureSystemRefs(prisma);

  const branches = await Promise.all(
    ['Cabang Melati', 'Cabang Kenanga'].map((name) =>
      prisma.branch.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: {},
        create: { name, address: `Jl. ${name} No. 1` },
      }),
    ),
  );

  const [kasTunai, bankUtama, qris, ewallet] = await Promise.all([
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
      update: {
        name: 'Transfer Bank (BCA)',
      },
      create: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Transfer Bank (BCA)',
        type: 'BANK',
        openingBalance: '0',
      },
    }),
    prisma.account.upsert({
      where: { id: '00000000-0000-4000-8000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000003',
        name: 'QRIS',
        type: 'EWALLET',
        openingBalance: '0',
      },
    }),
    prisma.account.upsert({
      where: { id: '00000000-0000-4000-8000-000000000004' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000004',
        name: 'E-Wallet',
        type: 'EWALLET',
        openingBalance: '0',
      },
    }),
  ]);

  // Category ids are captured for the reconciliation fixtures, which write ledger entries directly.
  const categories = await Promise.all(
    [
      { name: 'Penjualan', type: 'INFLOW' as const },
      { name: 'Pembelian Bahan Baku', type: 'OUTFLOW' as const },
      { name: 'Operasional', type: 'OUTFLOW' as const },
    ].map((category) =>
      prisma.category.upsert({
        where: { tenantId_name: { tenantId, name: category.name } },
        update: {},
        create: category,
      }),
    ),
  );
  const categoryPenjualan = categories.find((c) => c.name === 'Penjualan')!;
  const categoryOperasional = categories.find((c) => c.name === 'Operasional')!;

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@ohmypos.local';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      role: 'OWNER',
      branchId: null,
      isActive: true,
    },
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
    update: {
      role: 'ADMIN',
      branchId: null,
      isActive: true,
    },
    create: {
      name: 'Admin Rekonsiliasi',
      email: 'admin@ohmypos.local',
      passwordHash: await bcrypt.hash('ChangeMe123!', 10),
      role: 'ADMIN',
      branchId: null,
    },
  });

  const kasirMelati = await prisma.user.upsert({
    where: { email: 'kasir@ohmypos.local' },
    update: {
      role: 'KASIR',
      branchId: branches[0].id,
      isActive: true,
    },
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
    where: { tenantId_name: { tenantId, name: 'Gula' } },
    update: {},
    create: {
      name: 'Gula',
      unit: 'kg',
      // 1:1 units, so the asserted HPP (4.530) does not move.
      purchaseUnit: 'kg',
      conversionFactor: '1.0000',
      unitCost: '12000.00',
      currentStock: '10.0000',
      lowStockThreshold: '2.0000',
    },
  });

  const kopi = await prisma.rawMaterial.upsert({
    where: { tenantId_name: { tenantId, name: 'Kopi' } },
    update: {},
    create: {
      name: 'Kopi',
      unit: 'kg',
      purchaseUnit: 'kg',
      conversionFactor: '1.0000',
      unitCost: '85000.00',
      currentStock: '5.0000',
      lowStockThreshold: '1.0000',
    },
  });

  // ADR-024 fixture (1 ekor = 10 pcs). No recipe and no movements, so no asserted figure moves.
  await prisma.rawMaterial.upsert({
    where: { tenantId_name: { tenantId, name: 'Ayam' } },
    update: {},
    create: {
      name: 'Ayam',
      unit: 'pcs',
      purchaseUnit: 'ekor',
      conversionFactor: '10.0000',
      // Rp45.000 per ekor ÷ 10 pcs — the handoff's worked example.
      unitCost: '4500.000000',
      currentStock: '0.0000',
      lowStockThreshold: '5.0000',
    },
  });

  // Opening stock declared equal to current stock: delta 0, so no asserted balance moves.
  const currentPeriodStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  );
  await prisma.openingStock.upsert({
    where: {
      rawMaterialId_periodMonth: {
        rawMaterialId: gula.id,
        periodMonth: currentPeriodStart,
      },
    },
    update: {},
    create: {
      rawMaterialId: gula.id,
      periodMonth: currentPeriodStart,
      quantity: '10.0000',
      unitPrice: '12000.00',
    },
  });

  const esKopiSusu = await prisma.product.upsert({
    where: { tenantId_name: { tenantId, name: 'Es Kopi Susu' } },
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
    where: { tenantId_name: { tenantId, name: 'Air Mineral' } },
    update: {},
    create: {
      name: 'Air Mineral',
      sellPrice: '5000.00',
      isActive: true,
    },
  });

  // Suppliers, purchases, payables, settlements
  const supplierSumberRejeki = await prisma.supplier.upsert({
    where: { tenantId_name: { tenantId, name: 'Toko Sumber Rejeki' } },
    update: {},
    create: {
      name: 'Toko Sumber Rejeki',
      contact: '0812-1111-2222',
    },
  });

  const supplierKopiNusantara = await prisma.supplier.upsert({
    where: { tenantId_name: { tenantId, name: 'CV Kopi Nusantara' } },
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
    // to the system location by `resolveLedgerBranchId` (ADR-014).
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
          purchaseQuantity: '2.0000',
          lineTotal: '170000.00',
        },
        {
          rawMaterialId: gula.id,
          purchaseQuantity: '10.0000',
          lineTotal: '120000.00',
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
          purchaseQuantity: '5.0000',
          lineTotal: '60000.00',
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

  // Sales. Sale S1: 2 × Es Kopi Susu; hppAtSale = 4530.00 (also the toJSON() scale trap).
  const existingSaleS1 = await prisma.sale.findFirst({
    where: {
      branchId: branches[0].id,
      accountId: kasTunai.id,
      items: { some: { productId: esKopiSusu.id } },
    },
  });

  if (!existingSaleS1) {
    // The service computes hppAtSale, totalAmount and the stock decrement.
    await salesService.create(
      {
        branchId: branches[0].id,
        accountId: kasTunai.id,
        soldAt: '2026-08-16T15:00:00.000Z',
        items: [{ productId: esKopiSusu.id, quantity: '2' }],
      },
      kasirMelati.id,
    );
  }

  // Reconciliation fixtures, written directly; statuses come from the real trigger.
  // BT1 EXACT · BT2a+BT2b AGGREGATION · BT3 FUZZY · BT4 PARTIALLY_ALLOCATED ·
  // BT5 MATCHED · BT6 PENDING_REVIEW, no candidate · BT7 UNRESOLVED.
  async function upsertReconTxn(input: {
    externalRef: string;
    txnDate: string;
    amount: string;
    type: 'INFLOW' | 'OUTFLOW';
    description: string;
    status?: 'UNRESOLVED' | 'PENDING_REVIEW';
  }) {
    return prisma.bankTransaction.upsert({
      where: {
        accountId_externalRef: {
          accountId: bankUtama.id,
          externalRef: input.externalRef,
        },
      },
      update: {},
      create: {
        accountId: bankUtama.id,
        externalRef: input.externalRef,
        txnDate: new Date(input.txnDate),
        amount: input.amount,
        type: input.type,
        description: input.description,
        status: input.status ?? 'UNRESOLVED',
      },
    });
  }

  async function upsertReconLedgerEntry(input: {
    note: string;
    entryDate: string;
    amount: string;
    type: 'INFLOW' | 'OUTFLOW';
    categoryId: string;
    branchId: string;
  }) {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { accountId: bankUtama.id, note: input.note },
    });
    if (existing) return existing;

    return prisma.ledgerEntry.create({
      data: {
        accountId: bankUtama.id,
        categoryId: input.categoryId,
        branchId: input.branchId,
        entryDate: new Date(input.entryDate),
        amount: input.amount,
        type: input.type,
        note: input.note,
        sourceType: 'MANUAL',
      },
    });
  }

  await upsertReconLedgerEntry({
    note: 'Penjualan tunai QRIS (seed rekonsiliasi)',
    entryDate: '2026-08-17T09:00:00.000Z',
    amount: '250000.00',
    type: 'INFLOW',
    categoryId: categoryPenjualan.id,
    branchId: branches[0].id,
  });
  await upsertReconLedgerEntry({
    note: 'Penjualan gabungan QRIS (seed rekonsiliasi)',
    entryDate: '2026-08-15T09:00:00.000Z',
    amount: '180000.00',
    type: 'INFLOW',
    categoryId: categoryPenjualan.id,
    branchId: branches[1].id,
  });
  await upsertReconLedgerEntry({
    note: 'Biaya admin bank bulanan (seed rekonsiliasi)',
    entryDate: '2026-08-14T09:00:00.000Z',
    amount: '75000.00',
    type: 'OUTFLOW',
    categoryId: categoryOperasional.id,
    branchId: branches[0].id,
  });
  const le4 = await upsertReconLedgerEntry({
    note: 'Setoran tunai cabang, alokasi sebagian (seed rekonsiliasi)',
    entryDate: '2026-08-10T09:00:00.000Z',
    amount: '300000.00',
    type: 'INFLOW',
    categoryId: categoryPenjualan.id,
    branchId: branches[0].id,
  });
  const le5 = await upsertReconLedgerEntry({
    note: 'Pembayaran listrik PLN (seed rekonsiliasi)',
    entryDate: '2026-08-12T09:00:00.000Z',
    amount: '45000.00',
    type: 'OUTFLOW',
    categoryId: categoryOperasional.id,
    branchId: branches[0].id,
  });

  await upsertReconTxn({
    externalRef: 'SEED-RECON-BT1',
    txnDate: '2026-08-17T10:00:00.000Z',
    amount: '250000.00',
    type: 'INFLOW',
    description: 'Setoran QRIS Cabang Melati',
  });
  await upsertReconTxn({
    externalRef: 'SEED-RECON-BT2A',
    txnDate: '2026-08-15T08:00:00.000Z',
    amount: '100000.00',
    type: 'INFLOW',
    description: 'Transfer masuk QRIS #1',
  });
  await upsertReconTxn({
    externalRef: 'SEED-RECON-BT2B',
    txnDate: '2026-08-16T08:00:00.000Z',
    amount: '80000.00',
    type: 'INFLOW',
    description: 'Transfer masuk QRIS #2',
  });
  await upsertReconTxn({
    externalRef: 'SEED-RECON-BT3',
    txnDate: '2026-08-16T11:00:00.000Z',
    amount: '75000.00',
    type: 'OUTFLOW',
    description: 'Biaya admin bank bulanan',
  });
  const bt4 = await upsertReconTxn({
    externalRef: 'SEED-RECON-BT4',
    txnDate: '2026-08-10T10:00:00.000Z',
    amount: '500000.00',
    type: 'INFLOW',
    description: 'Setoran tunai cabang Melati',
  });
  const bt5 = await upsertReconTxn({
    externalRef: 'SEED-RECON-BT5',
    txnDate: '2026-08-12T10:00:00.000Z',
    amount: '45000.00',
    type: 'OUTFLOW',
    description: 'Pembayaran listrik PLN',
  });
  await upsertReconTxn({
    externalRef: 'SEED-RECON-BT6',
    txnDate: '2026-08-13T10:00:00.000Z',
    amount: '90000.00',
    type: 'INFLOW',
    description: 'Transfer belum ditinjau (dari sesi sebelumnya)',
    status: 'PENDING_REVIEW',
  });
  await upsertReconTxn({
    externalRef: 'SEED-RECON-BT7',
    txnDate: '2026-08-01T10:00:00.000Z',
    amount: '15000.00',
    type: 'OUTFLOW',
    description: 'Biaya tidak diketahui',
  });

  // BT1, BT2a, BT2b, BT3, BT7 stay UNRESOLVED — no Allocation row touches them.

  // BT4: allocate 300,000 of 500,000 against LE4 -> trigger sets PARTIALLY_ALLOCATED.
  await prisma.allocation.upsert({
    where: {
      bankTransactionId_idempotencyKey: {
        bankTransactionId: bt4.id,
        idempotencyKey: 'seed-alloc-bt4-le4',
      },
    },
    update: {},
    create: {
      bankTransactionId: bt4.id,
      ledgerEntryId: le4.id,
      amountPortion: '300000.00',
      idempotencyKey: 'seed-alloc-bt4-le4',
    },
  });

  // BT5: allocate the full 45,000 against LE5 -> trigger sets MATCHED.
  await prisma.allocation.upsert({
    where: {
      bankTransactionId_idempotencyKey: {
        bankTransactionId: bt5.id,
        idempotencyKey: 'seed-alloc-bt5-le5',
      },
    },
    update: {},
    create: {
      bankTransactionId: bt5.id,
      ledgerEntryId: le5.id,
      amountPortion: '45000.00',
      idempotencyKey: 'seed-alloc-bt5-le5',
    },
  });

  // Sample leave requests
  const ownerUser = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  if (ownerUser) {
    // 1. Pending leave request from Kasir Melati
    const existingPending = await prisma.leaveRequest.findFirst({
      where: {
        userId: kasirMelati.id,
        reason: 'Acara keluarga di luar kota',
      },
    });
    if (!existingPending) {
      await prisma.leaveRequest.create({
        data: {
          userId: kasirMelati.id,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-03'),
          reason: 'Acara keluarga di luar kota',
          status: 'PENDING',
        },
      });
    }

    // 2. Approved leave request
    const existingApproved = await prisma.leaveRequest.findFirst({
      where: {
        userId: kasirMelati.id,
        reason: 'Istirahat dan cek kesehatan',
      },
    });
    if (!existingApproved) {
      await prisma.leaveRequest.create({
        data: {
          userId: kasirMelati.id,
          startDate: new Date('2026-08-10'),
          endDate: new Date('2026-08-11'),
          reason: 'Istirahat dan cek kesehatan',
          status: 'APPROVED',
          reviewedByUserId: ownerUser.id,
          reviewedAt: new Date('2026-08-09T09:00:00.000Z'),
        },
      });
    }

    // 3. Rejected leave request
    const existingRejected = await prisma.leaveRequest.findFirst({
      where: {
        userId: kasirMelati.id,
        reason: 'Liburan mendadak',
      },
    });
    if (!existingRejected) {
      await prisma.leaveRequest.create({
        data: {
          userId: kasirMelati.id,
          startDate: new Date('2026-08-18'),
          endDate: new Date('2026-08-20'),
          reason: 'Liburan mendadak',
          status: 'REJECTED',
          reviewedByUserId: ownerUser.id,
          reviewedAt: new Date('2026-08-17T14:30:00.000Z'),
        },
      });
    }
  }

  console.log(`Seeded. Owner login: ${ownerEmail}`);
  console.log(`Platform admin login: ${platformAdminEmail}`);
  await unscoped.$disconnect();
}

void main();
