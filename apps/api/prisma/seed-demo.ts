import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import {
  PrismaService,
  UnscopedPrismaService,
} from '../src/common/prisma/prisma.service';
import { runWithTenant } from '../src/common/prisma/tenant-context';
import { tenantExtension } from '../src/common/prisma/tenant.extension';
import { LedgerEntriesService } from '../src/modules/ledger-entries/ledger-entries.service';
import { PayablesService } from '../src/modules/payables/payables.service';
import { StockMovementsService } from '../src/modules/stock-movements/stock-movements.service';
import { SupplierPurchasesService } from '../src/modules/supplier-purchases/supplier-purchases.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { ensureSystemRefs } from '../src/common/system-refs';
import { Prisma } from '../src/generated/prisma/client';

/**
 * DEMO SEED — provisions ONE self-contained showcase tenant, safe to run
 * against a production database.
 *
 * This is deliberately NOT `prisma/seed.ts`. That file is the development
 * fixture set and must never touch prod: it upserts the tenant with slug
 * `default` (so it attaches to the real business), creates a PlatformAdmin and
 * two staff users on the hardcoded password `ChangeMe123!`, and pins four
 * Accounts to hardcoded primary keys `00000000-…-0001..0004` — global PKs that
 * a second tenant would collide with outright.
 *
 * Everything here is different on all four counts:
 *
 *  1. The tenant is named by env (`DEMO_TENANT_SLUG`) and `default` is
 *     rejected, so the real business's tenant is unreachable from this script.
 *  2. No PlatformAdmin is ever written — prod's operator account belongs to
 *     `scripts/create-platform-admin.ts`.
 *  3. Every password comes from env with no fallback; the script exits rather
 *     than invent one.
 *  4. Every id is derived from the tenant slug (`uuidFrom`), so two demo
 *     tenants can coexist and a re-run is a no-op rather than a duplicate.
 *
 * Writes happen inside `runWithTenant`, so the ADR-025 extension stamps and
 * narrows every query — a cross-tenant write is not expressible here.
 *
 * Derived money and stock figures (`hppAtSale`, `currentStock`, `unitCost`,
 * `remainingBalance`, `paymentStatus`) go through the same services the API
 * runs, for the reason `seed.ts` documents: those columns have exactly one
 * legitimate writer, and a seed that computed them by hand would be a second.
 * Only the inputs below are literals.
 *
 * Usage:
 *   DEMO_TENANT_SLUG=demo-kopi-senja \
 *   DEMO_TENANT_NAME="Kopi Senja" \
 *   DEMO_OWNER_NAME="Budi Santoso" \
 *   DEMO_OWNER_EMAIL=budi@kopisenja.demo \
 *   DEMO_OWNER_PASSWORD='...' \
 *   pnpm --filter api db:seed:demo -- --yes
 *
 * Without `--yes` it prints what it would do and exits without writing.
 */

// ---------------------------------------------------------------------------
// Determinism helpers
// ---------------------------------------------------------------------------

/**
 * A stable UUIDv5-shaped id from a seed string. Every row this script creates
 * is keyed by one, which is what makes a re-run an upsert instead of a
 * duplicate — including the service-created Sales and Purchases, whose
 * `idempotencyKey` must be a UUID (`IdempotencyKey = UuidString`).
 *
 * The tenant slug is folded into every seed so two demo tenants in the same
 * database never collide on `Device.activationCode`, which is globally unique.
 */
function makeUuidFactory(slug: string) {
  return function uuidFrom(seed: string): string {
    const bytes = createHash('sha1')
      .update(`ohmypos-demo-seed:${slug}:${seed}`)
      .digest()
      .subarray(0, 16);
    const b = Buffer.from(bytes);
    b[6] = (b[6] & 0x0f) | 0x50; // version 5
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = b.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  };
}

/**
 * Seeded PRNG (mulberry32). The sale mix must be identical on every run or the
 * idempotency keys would name different sales each time and a second run would
 * double the demo's revenue.
 */
function makeRandom(slug: string): () => number {
  let state = createHash('sha1').update(slug).digest().readUInt32LE(0);
  return function random(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `Error: ${name} wajib diisi. Seed demo tidak punya nilai default — lihat komentar di atas file ini.`,
    );
    process.exit(1);
  }
  return value;
}

interface DemoConfig {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  staffPassword: string;
  staffDomain: string;
  /** Multiplies both the restock quantities and the daily sale count together. */
  volume: number;
  apply: boolean;
}

function readConfig(): DemoConfig {
  const slug = requireEnv('DEMO_TENANT_SLUG').toLowerCase();

  // The one slug that must never be a demo target: `create-owner.ts` and
  // `seed.ts` both adopt it, so it is the real business on any v1-bootstrapped
  // install.
  if (slug === 'default') {
    console.error(
      'Error: DEMO_TENANT_SLUG tidak boleh "default" — itu tenant bisnis asli (create-owner.ts). Pilih slug lain, mis. "demo-kopi-senja".',
    );
    process.exit(1);
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug)) {
    console.error(
      'Error: DEMO_TENANT_SLUG harus huruf kecil/angka/tanda hubung, 3-48 karakter, tidak diawali/diakhiri tanda hubung.',
    );
    process.exit(1);
  }

  const ownerEmail = requireEnv('DEMO_OWNER_EMAIL').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    console.error('Error: DEMO_OWNER_EMAIL bukan format email yang valid.');
    process.exit(1);
  }

  const ownerPassword = requireEnv('DEMO_OWNER_PASSWORD');
  if (ownerPassword.length < 8) {
    console.error('Error: DEMO_OWNER_PASSWORD minimal 8 karakter.');
    process.exit(1);
  }

  const staffPassword = process.env.DEMO_STAFF_PASSWORD?.trim() || ownerPassword;
  if (staffPassword.length < 8) {
    console.error('Error: DEMO_STAFF_PASSWORD minimal 8 karakter.');
    process.exit(1);
  }

  const volume = Number(process.env.DEMO_VOLUME?.trim() || '1');
  if (!Number.isInteger(volume) || volume < 1 || volume > 10) {
    console.error('Error: DEMO_VOLUME harus bilangan bulat 1-10.');
    process.exit(1);
  }

  return {
    slug,
    name: requireEnv('DEMO_TENANT_NAME'),
    ownerName: requireEnv('DEMO_OWNER_NAME'),
    ownerEmail,
    ownerPassword,
    staffPassword,
    // Staff emails are derived, not configured: `User.email` is unique across
    // ALL tenants (ADR-025 Decision 6), so a fixed `admin@…` would make the
    // second demo tenant fail on a unique violation halfway through.
    staffDomain: process.env.DEMO_STAFF_EMAIL_DOMAIN?.trim().toLowerCase() ||
      `${slug}.ohmypos.demo`,
    volume,
    apply: process.argv.includes('--yes'),
  };
}

// ---------------------------------------------------------------------------
// Demo data definitions
// ---------------------------------------------------------------------------

const BRANCHES = [
  { key: 'dago', name: 'Kopi Senja Dago', address: 'Jl. Ir. H. Juanda No. 112, Bandung', isMainStore: true },
  { key: 'riau', name: 'Kopi Senja Riau', address: 'Jl. R.E. Martadinata No. 45, Bandung', isMainStore: false },
] as const;

const ACCOUNTS = [
  { key: 'kas', name: 'Kas Tunai', type: 'CASH' as const, openingBalance: '2000000.00' },
  { key: 'bca', name: 'Bank BCA', type: 'BANK' as const, openingBalance: '25000000.00' },
  { key: 'qris', name: 'QRIS', type: 'EWALLET' as const, openingBalance: '0.00' },
  { key: 'gopay', name: 'GoPay', type: 'EWALLET' as const, openingBalance: '0.00' },
] as const;

/** On top of the two system categories `ensureSystemRefs` creates. */
const EXTRA_CATEGORIES = [
  { name: 'Gaji & Upah', type: 'OUTFLOW' as const },
  { name: 'Sewa Tempat', type: 'OUTFLOW' as const },
  { name: 'Listrik & Air', type: 'OUTFLOW' as const },
  { name: 'Operasional', type: 'OUTFLOW' as const },
  { name: 'Pendapatan Lain', type: 'INFLOW' as const },
] as const;

/**
 * ADR-024 throughout: every material is BOUGHT in one unit and STOCKED in
 * another, which is the realistic case and the one the demo should show. The
 * `unitCost` below is only the opening estimate — the first purchase's
 * latest-cost write-back replaces it with `lineTotal / (purchaseQuantity ×
 * conversionFactor)`, and the purchase lines further down are priced so that
 * recomputed figure lands exactly on these numbers.
 */
const MATERIALS = [
  { key: 'kopi', name: 'Biji Kopi Arabika', unit: 'gram', purchaseUnit: 'kg', conversionFactor: '1000', unitCost: '180.000000', lowStockThreshold: '500' },
  { key: 'susu', name: 'Susu UHT Full Cream', unit: 'ml', purchaseUnit: 'liter', conversionFactor: '1000', unitCost: '18.000000', lowStockThreshold: '5000' },
  { key: 'gulaAren', name: 'Gula Aren Cair', unit: 'ml', purchaseUnit: 'liter', conversionFactor: '1000', unitCost: '35.000000', lowStockThreshold: '1000' },
  { key: 'es', name: 'Es Batu Kristal', unit: 'gram', purchaseUnit: 'kg', conversionFactor: '1000', unitCost: '3.000000', lowStockThreshold: '5000' },
  { key: 'matcha', name: 'Bubuk Matcha', unit: 'gram', purchaseUnit: 'pack', conversionFactor: '500', unitCost: '250.000000', lowStockThreshold: '200' },
  { key: 'cokelat', name: 'Bubuk Cokelat', unit: 'gram', purchaseUnit: 'pack', conversionFactor: '1000', unitCost: '95.000000', lowStockThreshold: '300' },
  { key: 'teh', name: 'Teh Melati Kering', unit: 'gram', purchaseUnit: 'pack', conversionFactor: '250', unitCost: '180.000000', lowStockThreshold: '100' },
  { key: 'airBotol', name: 'Air Mineral Botol 600ml', unit: 'pcs', purchaseUnit: 'dus', conversionFactor: '24', unitCost: '2000.000000', lowStockThreshold: '12' },
  { key: 'roti', name: 'Roti Tawar', unit: 'slice', purchaseUnit: 'bungkus', conversionFactor: '10', unitCost: '2200.000000', lowStockThreshold: '20' },
  { key: 'keju', name: 'Keju Cheddar', unit: 'gram', purchaseUnit: 'blok', conversionFactor: '180', unitCost: '150.000000', lowStockThreshold: '360' },
  { key: 'cup', name: 'Cup Plastik 16oz', unit: 'pcs', purchaseUnit: 'pack', conversionFactor: '50', unitCost: '700.000000', lowStockThreshold: '100' },
] as const;

type MaterialKey = (typeof MATERIALS)[number]['key'];

/**
 * Every product carries a recipe on purpose. `SalesService` rejects a
 * recipeless product outright (ADR-013, `RecipeIncompleteException`), so a
 * product without one would sit on the demo menu and fail the moment a
 * prospect tried to ring it up.
 */
const PRODUCTS: ReadonlyArray<{
  key: string;
  name: string;
  sellPrice: string;
  wastePercent?: string;
  recipe: ReadonlyArray<{ material: MaterialKey; quantityUsed: string }>;
}> = [
  { key: 'kopsu', name: 'Kopi Susu Gula Aren', sellPrice: '18000.00', recipe: [
    { material: 'kopi', quantityUsed: '18' }, { material: 'susu', quantityUsed: '150' },
    { material: 'gulaAren', quantityUsed: '25' }, { material: 'es', quantityUsed: '120' },
    { material: 'cup', quantityUsed: '1' } ] },
  { key: 'americano', name: 'Americano', sellPrice: '16000.00', recipe: [
    { material: 'kopi', quantityUsed: '18' }, { material: 'es', quantityUsed: '120' },
    { material: 'cup', quantityUsed: '1' } ] },
  { key: 'cappuccino', name: 'Cappuccino', sellPrice: '22000.00', recipe: [
    { material: 'kopi', quantityUsed: '18' }, { material: 'susu', quantityUsed: '180' },
    { material: 'cup', quantityUsed: '1' } ] },
  { key: 'matchaLatte', name: 'Matcha Latte', sellPrice: '24000.00', recipe: [
    { material: 'matcha', quantityUsed: '8' }, { material: 'susu', quantityUsed: '200' },
    { material: 'es', quantityUsed: '100' }, { material: 'cup', quantityUsed: '1' } ] },
  { key: 'cokelatPanas', name: 'Cokelat Panas', sellPrice: '20000.00', recipe: [
    { material: 'cokelat', quantityUsed: '25' }, { material: 'susu', quantityUsed: '200' },
    { material: 'cup', quantityUsed: '1' } ] },
  { key: 'esTeh', name: 'Es Teh Melati', sellPrice: '10000.00', recipe: [
    { material: 'teh', quantityUsed: '5' }, { material: 'gulaAren', quantityUsed: '20' },
    { material: 'es', quantityUsed: '150' }, { material: 'cup', quantityUsed: '1' } ] },
  { key: 'airMineral', name: 'Air Mineral', sellPrice: '6000.00', recipe: [
    { material: 'airBotol', quantityUsed: '1' } ] },
  // The only product with waste, so the `wastePercent` column is visible in the
  // demo rather than uniformly zero.
  { key: 'rotiKeju', name: 'Roti Bakar Keju', sellPrice: '15000.00', wastePercent: '5.00', recipe: [
    { material: 'roti', quantityUsed: '2' }, { material: 'keju', quantityUsed: '30' } ] },
];

const SUPPLIERS = [
  { key: 'kopiNusantara', name: 'CV Kopi Nusantara', contact: '0812-1111-2222' },
  { key: 'sumberRejeki', name: 'Toko Sumber Rejeki', contact: '0813-3333-4444' },
  { key: 'kemasanJaya', name: 'UD Kemasan Jaya', contact: '0857-5555-6666' },
] as const;

/**
 * Restock history. Line prices are chosen so the latest-cost write-back
 * (ADR-024, `lineTotal / (purchaseQuantity × conversionFactor)`) reproduces
 * each material's `unitCost` above exactly — e.g. 5 kg for Rp900.000 over
 * 5 × 1000 gram is Rp180/gram. Change one side and the demo's HPP moves.
 */
interface PurchasePlan {
  key: string;
  supplier: (typeof SUPPLIERS)[number]['key'];
  /** `null` = central purchase (ADR-004) — the only way to record one. */
  branch: (typeof BRANCHES)[number]['key'] | null;
  daysAgo: number;
  paymentStatus: 'PAID' | 'UNPAID';
  account?: (typeof ACCOUNTS)[number]['key'];
  note: string;
  items: ReadonlyArray<{
    material: MaterialKey;
    purchaseQuantity: string;
    lineTotal: string;
  }>;
  /** Only for UNPAID — a partial settlement, so the payable lands PARTIALLY_SETTLED. */
  settlement?: {
    daysAgo: number;
    amount: string;
    account: (typeof ACCOUNTS)[number]['key'];
    note: string;
  };
}

/**
 * The shelf-stable half: bought once, in bulk, before the sales window opens.
 *
 * Line prices reproduce each material's `unitCost` exactly under the
 * latest-cost write-back (ADR-024, `lineTotal / (purchaseQuantity ×
 * conversionFactor)`) — 4 kg for Rp720.000 over 4 × 1000 gram is Rp180/gram.
 * Change one side and the demo's HPP moves.
 */
const BULK_PURCHASES: ReadonlyArray<PurchasePlan> = [
  { key: 'P1', supplier: 'kopiNusantara', branch: null, daysAgo: 45, paymentStatus: 'PAID', account: 'bca',
    note: 'Restock bahan kopi & bubuk (pusat)', items: [
      { material: 'kopi', purchaseQuantity: '4', lineTotal: '720000.00' },
      { material: 'matcha', purchaseQuantity: '3', lineTotal: '375000.00' },
      { material: 'cokelat', purchaseQuantity: '3', lineTotal: '285000.00' },
      { material: 'teh', purchaseQuantity: '4', lineTotal: '180000.00' } ] },
  // UNPAID, so the service writes a Payable and deliberately NO LedgerEntry
  // (ADR-006). The settlement below is what makes money actually move.
  { key: 'P2', supplier: 'kemasanJaya', branch: null, daysAgo: 44, paymentStatus: 'UNPAID',
    note: 'Kemasan & air mineral (tempo 30 hari)', items: [
      { material: 'cup', purchaseQuantity: '10', lineTotal: '350000.00' },
      { material: 'airBotol', purchaseQuantity: '5', lineTotal: '240000.00' } ],
    settlement: { daysAgo: 20, amount: '250000.00', account: 'bca', note: 'Cicilan 1 dari Rp590.000' } },
  { key: 'P3', supplier: 'sumberRejeki', branch: 'riau', daysAgo: 43, paymentStatus: 'PAID', account: 'kas',
    note: 'Bahan makanan cabang Riau', items: [
      { material: 'roti', purchaseQuantity: '16', lineTotal: '352000.00' },
      { material: 'keju', purchaseQuantity: '12', lineTotal: '324000.00' } ] },
];

/**
 * The perishable half, bought WEEKLY across the sales window rather than once
 * up front.
 *
 * This is not decoration. With a single opening restock the simulated stock
 * only ever falls, so the last days of the window run dry and the demo's sale
 * rate decays — the dashboard's default "hari ini" view then lands on the
 * thinnest day of the whole dataset. A weekly cycle keeps the rate flat to the
 * final day, and is also how a coffee shop actually buys milk and ice.
 */
const WEEKLY_RESTOCK_DAYS = [42, 35, 28, 21, 14, 7] as const;
const WEEKLY_RESTOCK_ITEMS = [
  { material: 'susu', purchaseQuantity: '20', lineTotal: '360000.00' },
  { material: 'es', purchaseQuantity: '16', lineTotal: '48000.00' },
  { material: 'gulaAren', purchaseQuantity: '2', lineTotal: '70000.00' },
  { material: 'kopi', purchaseQuantity: '1.5', lineTotal: '270000.00' },
  { material: 'cup', purchaseQuantity: '3', lineTotal: '105000.00' },
] as const satisfies ReadonlyArray<{
  material: MaterialKey;
  purchaseQuantity: string;
  lineTotal: string;
}>;

const PURCHASES: ReadonlyArray<PurchasePlan> = [
  ...BULK_PURCHASES,
  ...WEEKLY_RESTOCK_DAYS.map((daysAgo, index): PurchasePlan => ({
    key: `R${index + 1}`,
    supplier: 'sumberRejeki',
    // Alternated so both branches carry purchase history and the branch filter
    // on the purchases screen has something to separate.
    branch: index % 2 === 0 ? 'dago' : 'riau',
    daysAgo,
    paymentStatus: 'PAID',
    account: index % 2 === 0 ? 'kas' : 'bca',
    note: `Belanja mingguan ${index % 2 === 0 ? 'cabang Dago' : 'cabang Riau'}`,
    items: WEEKLY_RESTOCK_ITEMS,
  })),
];

/**
 * Manual operating costs and other income — the non-sale half of the P&L.
 *
 * Two rules this list learned the hard way, both invisible until the daily
 * chart was actually drawn (the dashboard plots `income` and `netProfit` on ONE
 * shared Y axis, so a single outlier flattens every other day to nothing):
 *
 *  1. **A cash deposit is not income.** The first version booked "Setoran tunai
 *     kasir ke bank" as a 3.000.000 INFLOW under `Penjualan`. That is a
 *     transfer between two Accounts, and the sales behind it had ALREADY
 *     written their own INFLOW entries — so it double-counted revenue and put a
 *     9x spike on one day of a chart whose median day is ~390.000. This product
 *     has no transfer concept, so the entry must simply not exist.
 *  2. **Monthly costs land on different days.** Payroll and rent booked to the
 *     same date produced one -5.279.035 day against days of ~+300.000. Rent at
 *     the start of the month and payroll in two fortnightly runs is both more
 *     readable and closer to how a café actually pays.
 */
const MANUAL_ENTRIES = [
  { key: 'sewa', category: 'Sewa Tempat', type: 'OUTFLOW' as const, amount: '2000000.00', daysAgo: 31, account: 'bca' as const, branch: 'dago' as const, note: 'Sewa tempat cabang Dago' },
  { key: 'gaji1', category: 'Gaji & Upah', type: 'OUTFLOW' as const, amount: '1750000.00', daysAgo: 17, account: 'bca' as const, branch: 'dago' as const, note: 'Gaji karyawan (termin 1)' },
  { key: 'gaji2', category: 'Gaji & Upah', type: 'OUTFLOW' as const, amount: '1750000.00', daysAgo: 3, account: 'bca' as const, branch: 'riau' as const, note: 'Gaji karyawan (termin 2)' },
  { key: 'listrik', category: 'Listrik & Air', type: 'OUTFLOW' as const, amount: '600000.00', daysAgo: 12, account: 'bca' as const, branch: 'dago' as const, note: 'Tagihan listrik & air' },
  { key: 'internet', category: 'Operasional', type: 'OUTFLOW' as const, amount: '300000.00', daysAgo: 9, account: 'bca' as const, branch: 'riau' as const, note: 'Langganan internet cabang Riau' },
  { key: 'konsinyasi', category: 'Pendapatan Lain', type: 'INFLOW' as const, amount: '600000.00', daysAgo: 20, account: 'bca' as const, branch: 'dago' as const, note: 'Komisi penjualan konsinyasi kue' },
  { key: 'sewaEvent', category: 'Pendapatan Lain', type: 'INFLOW' as const, amount: '800000.00', daysAgo: 8, account: 'bca' as const, branch: 'dago' as const, note: 'Sewa area untuk acara komunitas' },
];

/**
 * Reconciliation fixtures on the Bank BCA account, covering every
 * `TransactionStatus` and giving `POST /matching/propose` one candidate of each
 * `MatchType`. Every amount stays near the daily trading scale on purpose, so a
 * reconciliation fixture cannot distort the income chart:
 *   BT1 vs `listrik`               — same amount, same day        -> EXACT
 *   BT2A + BT2B vs `internet`      — sum to the entry's amount     -> AGGREGATION
 *   BT3 vs `sewaEvent`             — same amount, 2 days apart     -> FUZZY
 *   BT4  — 1.400.000 with 600.000 pre-allocated to `konsinyasi`    -> PARTIALLY_ALLOCATED
 *   BT5  — 2.000.000 fully pre-allocated to `sewa`                 -> MATCHED
 *   BT6  — seeded PENDING_REVIEW with no candidate this session    -> shows that
 *          proposed candidates are not persisted
 *   BT7  — nothing nearby                                          -> UNRESOLVED
 *
 * `status` is left to `sync_transaction_status` for BT4/BT5: inserting the
 * Allocation row directly fires the same trigger the real API path fires.
 */
const BANK_TXNS: ReadonlyArray<{
  key: string;
  daysAgo: number;
  amount: string;
  type: 'INFLOW' | 'OUTFLOW';
  description: string;
  status?: 'UNRESOLVED' | 'PENDING_REVIEW';
}> = [
  { key: 'BT1', daysAgo: 12, amount: '600000.00', type: 'OUTFLOW' as const, description: 'BIAYA LISTRIK PLN' },
  { key: 'BT2A', daysAgo: 10, amount: '175000.00', type: 'OUTFLOW' as const, description: 'TRF INTERNET TAGIHAN 1' },
  { key: 'BT2B', daysAgo: 9, amount: '125000.00', type: 'OUTFLOW' as const, description: 'TRF INTERNET TAGIHAN 2' },
  { key: 'BT3', daysAgo: 6, amount: '800000.00', type: 'INFLOW' as const, description: 'TRSF E-BANKING CR SEWA AREA' },
  { key: 'BT4', daysAgo: 20, amount: '1400000.00', type: 'INFLOW' as const, description: 'TRSF MASUK KOMISI KONSINYASI' },
  { key: 'BT5', daysAgo: 31, amount: '2000000.00', type: 'OUTFLOW' as const, description: 'TRSF E-BANKING DB SEWA TEMPAT' },
  { key: 'BT6', daysAgo: 7, amount: '275000.00', type: 'INFLOW' as const, description: 'TRSF MASUK BELUM DITINJAU', status: 'PENDING_REVIEW' as const },
  { key: 'BT7', daysAgo: 25, amount: '120000.00', type: 'OUTFLOW' as const, description: 'BIAYA ADMIN TIDAK DIKENALI' },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Unclamped — the only caller that needs a future date is the pending leave request. */
/**
 * The business day in this product is **Asia/Jakarta**, not UTC — ADR-018, and
 * `report.schema.ts` pins every report range to `z.literal('Asia/Jakarta')`.
 *
 * So trading hours have to be generated as WIB wall-clock times and converted
 * back to instants. The first version of this seed set them with
 * `setUTCHours(8..20)`, which put the demo's opening hours on screen as
 * 15:00-03:00 WIB and split each day's takings across two report days.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const OPEN_HOUR_WIB = 8;
const CLOSE_HOUR_WIB = 21;

/** The WIB wall-clock hour right now (0-23). */
function currentHourWib(now: Date): number {
  return new Date(now.getTime() + WIB_OFFSET_MS).getUTCHours();
}

/**
 * The instant at `hour:minute` WIB, `daysAgo` WIB-days back. Never returns a
 * future instant: `CreateSaleSchema` rejects `soldAt` in the future outright.
 */
function atWib(now: Date, daysAgo: number, hour: number, minute = 0): Date {
  const wall = new Date(now.getTime() + WIB_OFFSET_MS);
  wall.setUTCDate(wall.getUTCDate() - daysAgo);
  wall.setUTCHours(hour, minute, 0, 0);
  const instant = new Date(wall.getTime() - WIB_OFFSET_MS);
  return instant.getTime() > now.getTime() ? now : instant;
}

function atOffsetDays(now: Date, daysAgo: number, hour = 10, minute = 0): Date {
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/**
 * `DEMO_VOLUME` scales the restock quantities and the daily sale count TOGETHER
 * — they are two halves of one number and must never move apart, or the demo
 * runs out of stock partway through its own history.
 *
 * Every literal quantity and price above is a whole number of purchase units,
 * so an integer multiple stays exact (no floating-point drift into the
 * `Decimal(18,4)` / `Decimal(18,2)` columns).
 */
function scaleQuantity(value: string, volume: number): string {
  return String(Number(value) * volume);
}

function scaleMoney(value: string, volume: number): string {
  return (Number(value) * volume).toFixed(2);
}

function printPlan(config: DemoConfig, dbLabel: string): void {
  console.log('--- Seed Demo OhMyPos (mode pratinjau) ---\n');
  console.log(`Database : ${dbLabel}`);
  console.log(`Tenant   : ${config.name} (slug: ${config.slug})`);
  console.log(`Owner    : ${config.ownerName} <${config.ownerEmail}>`);
  console.log(`Staf     : admin@${config.staffDomain}, kasir.dago@${config.staffDomain}, kasir.riau@${config.staffDomain}`);
  console.log(`Volume   : ${config.volume}× (DEMO_VOLUME)`);
  console.log('\nAkan dibuat (idempoten — menjalankan ulang tidak menggandakan):');
  console.log(`  - 1 profil bisnis, ${BRANCHES.length} cabang + 1 lokasi sistem "Umum"`);
  console.log(`  - ${ACCOUNTS.length} akun kas/bank, ${EXTRA_CATEGORIES.length + 2} kategori`);
  console.log('  - 4 pengguna (1 OWNER, 1 ADMIN, 2 KASIR)');
  console.log(`  - ${MATERIALS.length} bahan baku, ${PRODUCTS.length} produk beserta resep`);
  console.log(`  - ${SUPPLIERS.length} pemasok, ${PURCHASES.length} pembelian (termasuk 1 utang dengan cicilan)`);
  console.log(
    `  - ~${330 * config.volume} penjualan tersebar 42 hari terakhir, jam buka 08:00-21:00 WIB`,
  );
  console.log(`  - ${MANUAL_ENTRIES.length} jurnal manual, ${BANK_TXNS.length} mutasi bank + alokasi rekonsiliasi`);
  console.log('  - stok awal bulan berjalan, 2 perangkat, absensi, 3 pengajuan cuti');
  console.log('\nTIDAK disentuh: tenant lain, PlatformAdmin, dan tenant slug "default".');
  console.log('\nJalankan ulang dengan --yes untuk benar-benar menulis ke database.');
}

async function main(): Promise<void> {
  const config = readConfig();
  const uuidFrom = makeUuidFactory(config.slug);
  const random = makeRandom(config.slug);
  const now = new Date();

  let dbLabel = '(DATABASE_URL tidak terbaca)';
  try {
    const url = new URL(requireEnv('DATABASE_URL'));
    dbLabel = `${url.host}${url.pathname}`;
  } catch {
    console.error('Error: DATABASE_URL bukan URL yang valid.');
    process.exit(1);
  }

  if (!config.apply) {
    printPlan(config, dbLabel);
    return;
  }

  console.log(`Menulis data demo ke ${dbLabel} …`);

  const unscoped = new UnscopedPrismaService();

  const adminEmail = `admin@${config.staffDomain}`;
  const kasirEmails: Record<string, string> = {
    dago: `kasir.dago@${config.staffDomain}`,
    riau: `kasir.riau@${config.staffDomain}`,
  };
  const demoEmails = new Set([config.ownerEmail, adminEmail, ...Object.values(kasirEmails)]);

  try {
    // ADR-025 — `Tenant` lives outside every tenant scope, so it is read and
    // written with the unscoped client before the scope opens.
    const existingTenant = await unscoped.tenant.findUnique({
      where: { slug: config.slug },
    });

    if (existingTenant) {
      // The guard that keeps this script off a real customer. A slug typo that
      // happened to hit a live tenant would otherwise inject a fictional coffee
      // shop's stock and ledger into their books, and none of it is
      // distinguishable from their own data afterwards.
      const foreignUsers = await unscoped.user.findMany({
        where: { tenantId: existingTenant.id },
        select: { email: true },
      });
      const intruder = foreignUsers.find((u) => !demoEmails.has(u.email));
      if (intruder) {
        console.error(
          `Error: tenant "${config.slug}" sudah ada dan berisi pengguna di luar akun demo (${intruder.email}).\n` +
            'Ini kemungkinan tenant bisnis asli — dibatalkan. Pilih DEMO_TENANT_SLUG lain.',
        );
        process.exit(1);
      }
      console.log(`Tenant "${config.slug}" sudah ada — melanjutkan secara idempoten.`);
    }

    // `User.email` is globally unique (ADR-025 Decision 6), so a collision with
    // ANOTHER tenant has to be caught here: inside the scope it would only
    // surface as an opaque P2002 partway through.
    for (const email of demoEmails) {
      const owner = await unscoped.user.findUnique({
        where: { email },
        select: { tenantId: true },
      });
      if (owner && owner.tenantId !== existingTenant?.id) {
        console.error(
          `Error: email ${email} sudah dipakai tenant lain. Ganti DEMO_OWNER_EMAIL / DEMO_STAFF_EMAIL_DOMAIN.`,
        );
        process.exit(1);
      }
    }

    const tenant =
      existingTenant ??
      (await unscoped.tenant.create({
        data: { id: uuidFrom('tenant'), name: config.name, slug: config.slug },
      }));

    await runWithTenant(tenant.id, async () => {
      const prisma = unscoped.$extends(tenantExtension) as unknown as PrismaService;

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

      await seedTenant({
        prisma,
        tenantId: tenant.id,
        config,
        uuidFrom,
        random,
        now,
        adminEmail,
        kasirEmails,
        supplierPurchasesService,
        payablesService,
        salesService,
      });
    });

    console.log('\nSelesai. Kredensial demo:');
    console.log(`  OWNER : ${config.ownerEmail}`);
    console.log(`  ADMIN : ${adminEmail}`);
    console.log(`  KASIR : ${kasirEmails.dago} (Dago), ${kasirEmails.riau} (Riau)`);
    console.log('  Password: sesuai DEMO_OWNER_PASSWORD / DEMO_STAFF_PASSWORD yang Anda set.');
  } catch (error) {
    console.error('Gagal menjalankan seed demo:', error);
    process.exitCode = 1;
  } finally {
    await unscoped.$disconnect();
  }
}

interface SeedTenantArgs {
  prisma: PrismaService;
  tenantId: string;
  config: DemoConfig;
  uuidFrom: (seed: string) => string;
  random: () => number;
  now: Date;
  adminEmail: string;
  kasirEmails: Record<string, string>;
  supplierPurchasesService: SupplierPurchasesService;
  payablesService: PayablesService;
  salesService: SalesService;
}

async function seedTenant(args: SeedTenantArgs): Promise<void> {
  const {
    prisma, tenantId, config, uuidFrom, random, now, adminEmail, kasirEmails,
    supplierPurchasesService, payablesService, salesService,
  } = args;

  // --- Profile, system refs, branches -------------------------------------
  if (!(await prisma.businessProfile.findFirst())) {
    await prisma.businessProfile.create({
      data: { name: config.name, address: BRANCHES[0].address },
    });
  }

  // Same function `scripts/create-owner.ts` and `POST /platform/tenants` call,
  // so a demo tenant can never drift from a real install: without it the first
  // sale and the first central purchase both fail with a 503 (ADR-014/ADR-015).
  await ensureSystemRefs(prisma);

  const branchByKey = new Map<string, { id: string }>();
  for (const branch of BRANCHES) {
    const row = await prisma.branch.upsert({
      where: { tenantId_name: { tenantId, name: branch.name } },
      update: { address: branch.address },
      create: {
        name: branch.name,
        address: branch.address,
        isMainStore: branch.isMainStore,
      },
    });
    branchByKey.set(branch.key, row);
  }

  // --- Accounts and categories --------------------------------------------
  const accountByKey = new Map<string, { id: string }>();
  for (const account of ACCOUNTS) {
    const row = await prisma.account.upsert({
      where: { id: uuidFrom(`account:${account.key}`) },
      update: {},
      create: {
        id: uuidFrom(`account:${account.key}`),
        name: account.name,
        type: account.type,
        openingBalance: account.openingBalance,
      },
    });
    accountByKey.set(account.key, row);
  }

  const categoryByName = new Map<string, { id: string }>();
  for (const category of EXTRA_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { tenantId_name: { tenantId, name: category.name } },
      update: {},
      create: { name: category.name, type: category.type },
    });
    categoryByName.set(category.name, row);
  }
  // `Penjualan` is a SYSTEM category created by ensureSystemRefs, not by the
  // loop above — read it rather than upserting a second one.
  for (const name of ['Penjualan', 'Pembelian Bahan Baku']) {
    const row = await prisma.category.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
    if (row) categoryByName.set(name, row);
  }

  // --- Users ---------------------------------------------------------------
  const ownerHash = await bcrypt.hash(config.ownerPassword, 10);
  const staffHash = await bcrypt.hash(config.staffPassword, 10);

  // ADR-011 §2: OWNER and ADMIN are never assigned to a branch; KASIR always is.
  const owner = await prisma.user.upsert({
    where: { email: config.ownerEmail },
    update: { role: 'OWNER', branchId: null, isActive: true },
    create: {
      name: config.ownerName,
      email: config.ownerEmail,
      passwordHash: ownerHash,
      role: 'OWNER',
      branchId: null,
    },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', branchId: null, isActive: true },
    create: {
      name: 'Sinta Rahayu',
      email: adminEmail,
      passwordHash: staffHash,
      role: 'ADMIN',
      branchId: null,
    },
  });

  const kasirNames: Record<string, string> = {
    dago: 'Rizky Pratama',
    riau: 'Dewi Lestari',
  };
  const kasirByBranch = new Map<string, { id: string }>();
  for (const branch of BRANCHES) {
    const row = await prisma.user.upsert({
      where: { email: kasirEmails[branch.key] },
      update: {
        role: 'KASIR',
        branchId: branchByKey.get(branch.key)!.id,
        isActive: true,
      },
      create: {
        name: kasirNames[branch.key],
        email: kasirEmails[branch.key],
        passwordHash: staffHash,
        role: 'KASIR',
        branchId: branchByKey.get(branch.key)!.id,
      },
    });
    kasirByBranch.set(branch.key, row);
  }

  // --- Master data ---------------------------------------------------------
  const materialByKey = new Map<MaterialKey, { id: string }>();
  for (const material of MATERIALS) {
    const row = await prisma.rawMaterial.upsert({
      where: { tenantId_name: { tenantId, name: material.name } },
      update: {},
      create: {
        name: material.name,
        unit: material.unit,
        purchaseUnit: material.purchaseUnit,
        conversionFactor: material.conversionFactor,
        unitCost: material.unitCost,
        // Deliberately 0: every gram of stock in this demo arrives through a
        // real SupplierPurchase below, so the StockMovement trail explains the
        // balance instead of it appearing from nowhere.
        currentStock: '0',
        lowStockThreshold: material.lowStockThreshold,
      },
    });
    materialByKey.set(material.key, row);
  }

  const productByKey = new Map<string, { id: string }>();
  for (const product of PRODUCTS) {
    const row = await prisma.product.upsert({
      where: { tenantId_name: { tenantId, name: product.name } },
      update: {},
      create: {
        name: product.name,
        sellPrice: product.sellPrice,
        wastePercent: product.wastePercent ?? '0',
        isActive: true,
      },
    });
    productByKey.set(product.key, row);

    for (const line of product.recipe) {
      await prisma.recipeItem.upsert({
        where: {
          productId_rawMaterialId: {
            productId: row.id,
            rawMaterialId: materialByKey.get(line.material)!.id,
          },
        },
        update: { quantityUsed: line.quantityUsed },
        create: {
          productId: row.id,
          rawMaterialId: materialByKey.get(line.material)!.id,
          quantityUsed: line.quantityUsed,
        },
      });
    }
  }

  const supplierByKey = new Map<string, { id: string }>();
  for (const supplier of SUPPLIERS) {
    const row = await prisma.supplier.upsert({
      where: { tenantId_name: { tenantId, name: supplier.name } },
      update: { contact: supplier.contact },
      create: { name: supplier.name, contact: supplier.contact },
    });
    supplierByKey.set(supplier.key, row);
  }

  // --- Purchases, payables and settlements ---------------------------------
  // Through the service, never by hand: `currentStock`, `unitCost`,
  // `totalAmount`, `remainingBalance` and `paymentStatus` each have exactly one
  // legitimate writer, and a seed that set them directly would be a second one.
  for (const purchase of PURCHASES) {
    const created = await supplierPurchasesService.create({
      supplierId: supplierByKey.get(purchase.supplier)!.id,
      branchId: purchase.branch ? branchByKey.get(purchase.branch)!.id : null,
      purchaseDate: atWib(now, purchase.daysAgo, 9).toISOString(),
      paymentStatus: purchase.paymentStatus,
      accountId: purchase.account
        ? accountByKey.get(purchase.account)!.id
        : undefined,
      note: purchase.note,
      // The volume is part of the key: raising DEMO_VOLUME on an existing demo
      // tenant must record a NEW, larger restock rather than replay the old one
      // — otherwise the extra sales below would have no stock behind them.
      idempotencyKey: uuidFrom(`purchase:${purchase.key}:v${config.volume}`),
      items: purchase.items.map((item) => ({
        rawMaterialId: materialByKey.get(item.material)!.id,
        purchaseQuantity: scaleQuantity(item.purchaseQuantity, config.volume),
        lineTotal: scaleMoney(item.lineTotal, config.volume),
      })),
    });

    if (purchase.settlement && created.payableId) {
      await payablesService.settle(created.payableId, {
        accountId: accountByKey.get(purchase.settlement.account)!.id,
        amount: purchase.settlement.amount,
        settledAt: atWib(now, purchase.settlement.daysAgo, 11).toISOString(),
        note: purchase.settlement.note,
        idempotencyKey: uuidFrom(`settlement:${purchase.key}:v${config.volume}`),
      });
    }
  }

  // --- Sales ---------------------------------------------------------------
  //
  // The mix is planned in memory FIRST, against the quantities the purchases
  // above bring in — not against the database's live `currentStock`. That is
  // what keeps a re-run idempotent: reading live stock would produce a
  // different (already-depleted) plan on the second run, so a sale skipped the
  // first time would be created the second under a fresh key, and the demo's
  // revenue would climb every time someone re-ran the seed.
  const conversionByKey = new Map<MaterialKey, number>(
    MATERIALS.map((m) => [m.key, Number(m.conversionFactor)]),
  );

  // Restocks are replayed ON THE DAY THEY ARRIVE, not pooled up front. Pooling
  // them made the simulated stock a strictly falling curve, so the tail of the
  // window ran dry and the sale rate decayed — which is exactly the day the
  // dashboard opens on by default.
  const arrivals = PURCHASES.flatMap((purchase) =>
    purchase.items.map((item) => ({
      daysAgo: purchase.daysAgo,
      material: item.material,
      units:
        Number(item.purchaseQuantity) *
        config.volume *
        conversionByKey.get(item.material)!,
    })),
  ).sort((a, b) => b.daysAgo - a.daysAgo);

  const available = new Map<MaterialKey, number>(
    MATERIALS.map((m) => [m.key, 0]),
  );

  // An ABSOLUTE safety stock, deliberately not a share of cumulative purchases.
  // The share version rose with every restock, so each new delivery raised the
  // floor as fast as it raised the ceiling and the later weeks starved. Keyed
  // off `lowStockThreshold` — the column that already means "do not go below
  // this" — at 60%, so the busiest materials finish just under it and the
  // low-stock warning has something real to show.
  const safetyStock = new Map<MaterialKey, number>(
    MATERIALS.map((m) => [m.key, Number(m.lowStockThreshold) * 0.6]),
  );

  const recipeByProduct = new Map(
    PRODUCTS.map((p) => [p.key, p.recipe] as const),
  );

  const SALE_MIX: ReadonlyArray<{ key: string; weight: number }> = [
    { key: 'kopsu', weight: 30 },
    { key: 'cappuccino', weight: 14 },
    { key: 'americano', weight: 12 },
    { key: 'esTeh', weight: 12 },
    { key: 'matchaLatte', weight: 10 },
    { key: 'cokelatPanas', weight: 8 },
    { key: 'airMineral', weight: 8 },
    { key: 'rotiKeju', weight: 6 },
  ];
  const MIX_TOTAL = SALE_MIX.reduce((sum, item) => sum + item.weight, 0);
  const PAYMENT_MIX: ReadonlyArray<{ key: string; weight: number }> = [
    { key: 'kas', weight: 45 },
    { key: 'qris', weight: 35 },
    { key: 'gopay', weight: 12 },
    { key: 'bca', weight: 8 },
  ];
  const PAYMENT_TOTAL = PAYMENT_MIX.reduce((sum, item) => sum + item.weight, 0);

  function pick(
    mix: ReadonlyArray<{ key: string; weight: number }>,
    total: number,
  ): string {
    let roll = random() * total;
    for (const entry of mix) {
      roll -= entry.weight;
      if (roll <= 0) return entry.key;
    }
    return mix[mix.length - 1].key;
  }

  function tryConsume(productKey: string, quantity: number): boolean {
    const recipe = recipeByProduct.get(productKey)!;
    for (const line of recipe) {
      const need = Number(line.quantityUsed) * quantity;
      if (available.get(line.material)! - need < safetyStock.get(line.material)!) {
        return false;
      }
    }
    for (const line of recipe) {
      available.set(
        line.material,
        available.get(line.material)! - Number(line.quantityUsed) * quantity,
      );
    }
    return true;
  }

  const SALE_WINDOW_DAYS = 42;
  const hourNowWib = currentHourWib(now);
  interface PlannedSale {
    seed: string;
    branchKey: string;
    accountKey: string;
    soldAt: string;
    items: Array<{ productId: string; quantity: string }>;
  }
  const plannedSales: PlannedSale[] = [];
  let arrivalIndex = 0;

  for (let daysAgo = SALE_WINDOW_DAYS; daysAgo >= 0; daysAgo--) {
    while (
      arrivalIndex < arrivals.length &&
      arrivals[arrivalIndex].daysAgo >= daysAgo
    ) {
      const arrival = arrivals[arrivalIndex];
      available.set(
        arrival.material,
        available.get(arrival.material)! + arrival.units,
      );
      arrivalIndex++;
    }

    // Today is only open as far as the current WIB hour — a sale stamped later
    // than now is rejected by `CreateSaleSchema`, and before opening time today
    // legitimately has no trading yet.
    const closingHour = daysAgo === 0 ? Math.min(CLOSE_HOUR_WIB, hourNowWib) : CLOSE_HOUR_WIB;
    if (closingHour < OPEN_HOUR_WIB) continue;

    for (const branch of BRANCHES) {
      const salesToday = 2 + Math.floor(random() * (3 * config.volume + 2));
      for (let index = 0; index < salesToday; index++) {
        const lineCount = 1 + Math.floor(random() * 3);
        const quantities = new Map<string, number>();
        for (let line = 0; line < lineCount; line++) {
          const productKey = pick(SALE_MIX, MIX_TOTAL);
          const quantity = 1 + Math.floor(random() * 2);
          if (!tryConsume(productKey, quantity)) continue;
          quantities.set(
            productKey,
            (quantities.get(productKey) ?? 0) + quantity,
          );
        }
        if (quantities.size === 0) continue;

        plannedSales.push({
          // Volume in the key for the same reason it is in the purchase key: a
          // different volume is a different, self-consistent history, not an
          // edit to the one already recorded.
          seed: `sale:v${config.volume}:${daysAgo}:${branch.key}:${index}`,
          branchKey: branch.key,
          accountKey: pick(PAYMENT_MIX, PAYMENT_TOTAL),
          soldAt: atWib(
            now,
            daysAgo,
            OPEN_HOUR_WIB +
              Math.floor(random() * (closingHour - OPEN_HOUR_WIB + 1)),
            Math.floor(random() * 60),
          ).toISOString(),
          items: [...quantities.entries()].map(([productKey, quantity]) => ({
            productId: productByKey.get(productKey)!.id,
            quantity: String(quantity),
          })),
        });
      }
    }
  }

  for (const [index, sale] of plannedSales.entries()) {
    // No `role` argument on purpose: the 3-day backdate limit and the
    // price-override ban are KASIR rules (TASK-087, DEBT-009), and this seed is
    // writing history on the Owner's behalf, not ringing up a till.
    await salesService.create(
      {
        branchId: branchByKey.get(sale.branchKey)!.id,
        accountId: accountByKey.get(sale.accountKey)!.id,
        soldAt: sale.soldAt,
        items: sale.items,
        idempotencyKey: uuidFrom(sale.seed),
      },
      kasirByBranch.get(sale.branchKey)!.id,
    );
    if ((index + 1) % 20 === 0) {
      console.log(`  … ${index + 1}/${plannedSales.length} penjualan`);
    }
  }
  console.log(`  ${plannedSales.length} penjualan siap.`);

  // --- Manual ledger entries (the non-sale half of the P&L) ----------------
  for (const entry of MANUAL_ENTRIES) {
    const id = uuidFrom(`ledger:${entry.key}`);
    await prisma.ledgerEntry.upsert({
      where: { id },
      update: {},
      create: {
        id,
        accountId: accountByKey.get(entry.account)!.id,
        categoryId: categoryByName.get(entry.category)!.id,
        branchId: branchByKey.get(entry.branch)!.id,
        entryDate: atWib(now, entry.daysAgo, 13),
        amount: entry.amount,
        type: entry.type,
        note: entry.note,
        sourceType: 'MANUAL',
      },
    });
  }

  // --- Reconciliation fixtures --------------------------------------------
  const bankAccountId = accountByKey.get('bca')!.id;
  const bankTxnByKey = new Map<string, { id: string }>();
  for (const txn of BANK_TXNS) {
    const row = await prisma.bankTransaction.upsert({
      where: {
        accountId_externalRef: {
          accountId: bankAccountId,
          externalRef: `DEMO-${txn.key}`,
        },
      },
      update: {},
      create: {
        accountId: bankAccountId,
        externalRef: `DEMO-${txn.key}`,
        txnDate: atWib(now, txn.daysAgo, 14),
        amount: txn.amount,
        type: txn.type,
        description: txn.description,
        status: txn.status ?? 'UNRESOLVED',
      },
    });
    bankTxnByKey.set(txn.key, row);
  }

  // `status` is left alone here: inserting the Allocation fires
  // `sync_transaction_status`, which sets PARTIALLY_ALLOCATED / MATCHED — the
  // same trigger path a real match through the API takes.
  const allocations = [
    { txn: 'BT4', ledger: 'konsinyasi', amountPortion: '600000.00' },
    { txn: 'BT5', ledger: 'sewa', amountPortion: '2000000.00' },
  ];
  for (const allocation of allocations) {
    const idempotencyKey = uuidFrom(`allocation:${allocation.txn}`);
    await prisma.allocation.upsert({
      where: {
        bankTransactionId_idempotencyKey: {
          bankTransactionId: bankTxnByKey.get(allocation.txn)!.id,
          idempotencyKey,
        },
      },
      update: {},
      create: {
        bankTransactionId: bankTxnByKey.get(allocation.txn)!.id,
        ledgerEntryId: uuidFrom(`ledger:${allocation.ledger}`),
        amountPortion: allocation.amountPortion,
        idempotencyKey,
      },
    });
  }

  // --- Opening stock for the current month ---------------------------------
  //
  // Written directly rather than through `OpeningStockService.upsert`: that
  // method applies the DELTA between the declaration and live stock as an
  // `OPENING` StockMovement, which is right when an Owner counts the shelf but
  // wrong here — the figure below is DERIVED from the movements this seed just
  // created, so pushing it back through the service would double-count it.
  // The WIB month, not the UTC one: between 17:00 and 24:00 UTC on the last day
  // of a month the two disagree, and every report period in this product is
  // Asia/Jakarta (ADR-018).
  const wibNow = new Date(now.getTime() + WIB_OFFSET_MS);
  const periodStart = new Date(
    Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), 1),
  );
  const priorMovements = await prisma.stockMovement.findMany({
    where: { movementDate: { lt: periodStart } },
    select: { rawMaterialId: true, direction: true, quantity: true },
  });
  const openingByMaterial = new Map<string, Prisma.Decimal>();
  for (const movement of priorMovements) {
    const running =
      openingByMaterial.get(movement.rawMaterialId) ?? new Prisma.Decimal(0);
    openingByMaterial.set(
      movement.rawMaterialId,
      movement.direction === 'IN'
        ? running.plus(movement.quantity)
        : running.minus(movement.quantity),
    );
  }

  for (const material of MATERIALS) {
    const rawMaterialId = materialByKey.get(material.key)!.id;
    const quantity = openingByMaterial.get(rawMaterialId) ?? new Prisma.Decimal(0);
    await prisma.openingStock.upsert({
      where: {
        rawMaterialId_periodMonth: { rawMaterialId, periodMonth: periodStart },
      },
      update: {},
      create: {
        rawMaterialId,
        periodMonth: periodStart,
        quantity: quantity.toFixed(4),
        unitPrice: material.unitCost,
      },
    });
  }

  // --- Devices, attendance and leave requests ------------------------------
  const deviceByBranch = new Map<string, { id: string }>();
  for (const branch of BRANCHES) {
    const id = uuidFrom(`device:${branch.key}`);
    const row = await prisma.device.upsert({
      where: { id },
      update: {},
      create: {
        id,
        branchId: branchByKey.get(branch.key)!.id,
        label: `Kasir ${branch.name}`,
        isActive: true,
        activatedByUserId: owner.id,
        activatedAt: atWib(now, 46, 8),
        // Consumed at activation in the real flow; kept null here so the demo
        // never shows a live activation code for an already-active device.
        activationCode: null,
        activationCodeExpiresAt: null,
      },
    });
    deviceByBranch.set(branch.key, row);
  }

  for (const branch of BRANCHES) {
    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      const id = uuidFrom(`attendance:${branch.key}:${daysAgo}`);
      // One deliberate violation, so the attendance screen has a non-happy
      // path to show. `isValid` is the stored fact, not something re-derived.
      const isViolation = branch.key === 'riau' && daysAgo === 3;
      await prisma.attendanceRecord.upsert({
        where: { id },
        update: {},
        create: {
          id,
          userId: kasirByBranch.get(branch.key)!.id,
          deviceId: isViolation ? null : deviceByBranch.get(branch.key)!.id,
          loginAt: atWib(now, daysAgo, 7, 45),
          isValid: !isViolation,
          violationReason: isViolation ? 'NO_DEVICE_COOKIE' : null,
        },
      });
    }
  }

  // Negative `daysAgo` means the future — a PENDING request for leave that has
  // already happened would be nonsense on the approval screen, so these use the
  // unclamped helper.
  const leaveRequests: ReadonlyArray<{
    key: string;
    branch: string;
    startDaysAgo: number;
    endDaysAgo: number;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewedDaysAgo?: number;
  }> = [
    { key: 'pending', branch: 'dago', startDaysAgo: -4, endDaysAgo: -6, reason: 'Acara keluarga di luar kota', status: 'PENDING' },
    { key: 'approved', branch: 'riau', startDaysAgo: 20, endDaysAgo: 19, reason: 'Istirahat dan cek kesehatan', status: 'APPROVED', reviewedDaysAgo: 22 },
    { key: 'rejected', branch: 'dago', startDaysAgo: 11, endDaysAgo: 9, reason: 'Liburan mendadak', status: 'REJECTED', reviewedDaysAgo: 13 },
  ];
  for (const leave of leaveRequests) {
    const id = uuidFrom(`leave:${leave.key}`);
    await prisma.leaveRequest.upsert({
      where: { id },
      update: {},
      create: {
        id,
        userId: kasirByBranch.get(leave.branch)!.id,
        startDate: atOffsetDays(now, leave.startDaysAgo, 0),
        endDate: atOffsetDays(now, leave.endDaysAgo, 0),
        reason: leave.reason,
        status: leave.status,
        reviewedByUserId:
          leave.status === 'PENDING' ? null : owner.id,
        reviewedAt:
          leave.reviewedDaysAgo === undefined
            ? null
            : atWib(now, leave.reviewedDaysAgo, 9),
      },
    });
  }
}

void main();
