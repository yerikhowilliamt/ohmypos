import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { LedgerEntriesService } from '../src/modules/ledger-entries/ledger-entries.service';
import { PayablesService } from '../src/modules/payables/payables.service';
import { StockMovementsService } from '../src/modules/stock-movements/stock-movements.service';
import { SupplierPurchasesService } from '../src/modules/supplier-purchases/supplier-purchases.service';
import { SalesService } from '../src/modules/sales/sales.service';

/**
 * Synthetic seed data only — fictional branches and staff, never anything from
 * the real business (Handbook §6).
 *
 * Load-bearing entities:
 *  - the initial OWNER (ADR-011 §5);
 *  - system categories (ADR-012);
 *  - system branch `Pusat (Dapur Sentral)` (ADR-014);
 *  - Phase 4 purchasing fixtures per §9.9 for hand verification and e2e testing;
 *  - Phase 5 sale fixture per plan §10.6.
 *
 * The Phase 4/5 fixtures go through `SupplierPurchasesService`, `PayablesService`
 * and `SalesService` rather than writing rows directly (Phase 4 plan §9.9,
 * Phase 5 plan §10.6). That is not ceremony: `remainingBalance`, `paymentStatus`
 * and `RawMaterial.currentStock` are denormalized balances whose correctness
 * rests on having exactly ONE writer each (Phase 4 plan §2 Option B). A seed
 * that wrote them by hand would be a second writer, and — because it lives
 * outside `apps/api/src` — one that the single-writer greps in the definition
 * of done cannot see. Hand-computing `4530.00` here would also silently desync
 * the moment a recipe or a raw material's cost changed. Every derived figure
 * below is produced by the same code the API runs; only the inputs are literals.
 *
 * The services are constructed directly instead of booting a Nest container:
 * they are plain classes, and `PrismaService` builds its own driver adapter
 * from `DATABASE_URL`, so manual wiring exercises the identical code path
 * without pulling in pino, throttling and config for a script.
 */
async function main() {
  const prisma = new PrismaService();

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

  // Required by ADR-012: system-generated ledger entries must have a category.
  // Resolved by name inside the services (`resolvePurchaseCategoryId`), so no
  // id is captured here for THOSE fixtures — but the reconciliation fixtures
  // below write LedgerEntry rows directly (there is no service for a MANUAL
  // entry's creation-with-category the way Purchases/Sales have one) and need
  // the ids, hence capturing the upsert results here.
  const categories = await Promise.all(
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
    where: { name: 'Gula' },
    update: {},
    create: {
      name: 'Gula',
      unit: 'kg',
      // Bought and stocked in the same unit — the 1:1 case every pre-ADR-024
      // material was backfilled to. Deliberately left at 1 so the seeded HPP
      // (0,25 kg × 12.000 + 0,018 kg × 85.000 = 4.530) that the Phase 4/5 e2e
      // suites assert on does not move.
      purchaseUnit: 'kg',
      conversionFactor: '1.0000',
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
      purchaseUnit: 'kg',
      conversionFactor: '1.0000',
      unitCost: '85000.00',
      currentStock: '5.0000',
      lowStockThreshold: '1.0000',
    },
  });

  // ADR-024 fixture — the material that actually exercises the purchase/stock
  // unit split, so `db:seed` produces a database where the feature is visible.
  // Bought per ekor, stocked and cooked per pcs, 1 ekor = 10 pcs. Deliberately
  // has NO recipe and NO stock movement: it must not shift any figure the
  // existing e2e suites assert on.
  await prisma.rawMaterial.upsert({
    where: { name: 'Ayam' },
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

  // Phase 6 §11.13 — one OpeningStock declaration for the current month, so the
  // Dashboard 4 and Dashboard 5 screens have something to render.
  //
  // Declared EQUAL to Gula's seeded currentStock on purpose: the delta is then
  // exactly 0, the seeded balance is unchanged, and adding this fixture cannot
  // shift the absolute stock numbers that the Phase 4 and Phase 5 e2e suites
  // assert on. A seed that moved those balances is ERR-004 happening a third
  // time.
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

  // ---------------------------------------------------------------------------
  // Phase 5: Sales & the outbound half of StockMovement (plan §10.6)
  // ---------------------------------------------------------------------------
  // Sale S1 — Cabang Melati, 2 × Es Kopi Susu at the menu price, paid to Kas Tunai.
  // hppAtSale (per unit) = 0.2500 × 12000.00 + 0.0180 × 85000.00 = 4530.00 —
  // deliberately the same figure TASK-005 uses to demonstrate the toJSON() scale
  // trap, so a decimal-serialization regression shows up in two suites at once.
  const existingSaleS1 = await prisma.sale.findFirst({
    where: {
      branchId: branches[0].id,
      accountId: kasTunai.id,
      items: { some: { productId: esKopiSusu.id } },
    },
  });

  if (!existingSaleS1) {
    // Server computes hppAtSale, totalAmount and the stock decrement — none of
    // those are literals here, same discipline as the Phase 4 fixtures above.
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

  // ---------------------------------------------------------------------------
  // Phase 8h/8j: Reconciliation fixtures (plan §9.2 E2E smoke needs something to
  // click on). BankTransaction and LedgerEntry are written directly with
  // `prisma` rather than through a service — unlike the Phase 4/5 fixtures
  // above, nothing here is a denormalized balance a service derives; `status`
  // is either a plain literal or left for `trg_check_allocation_sum`'s
  // `sync_transaction_status` trigger to set the instant an Allocation row is
  // inserted (docs/plannings/phase-8h-reconciliation.md §1.3) — exactly what
  // happens through the real API, so writing the Allocation row directly here
  // exercises the identical trigger path.
  //
  // Covers every `TransactionStatus` and gives `POST /matching/propose`
  // (docs/plannings/phase-8h-reconciliation.md §1.4) one candidate of each
  // `MatchType`:
  //  - BT1 vs LE1: same amount, same day        -> EXACT
  //  - BT2a + BT2b vs LE2: sum to LE2's amount   -> AGGREGATION
  //  - BT3 vs LE3: same amount, 2 days apart     -> FUZZY (default tolerance 3d)
  //  - BT4: pre-allocated 300,000 of 500,000     -> PARTIALLY_ALLOCATED
  //  - BT5: pre-allocated exactly 45,000         -> MATCHED
  //  - BT6: seeded already PENDING_REVIEW, no candidate in this session's
  //    queue -> demonstrates the "candidates are not persisted" trap directly
  //    (§1.4) without the operator having to reload mid-session to see it.
  //  - BT7: no nearby ledger entry               -> UNRESOLVED, no candidate
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

  // Phase 12 — Seed sample leave requests for UI inspection and verification
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
  await prisma.$disconnect();
}

void main();
