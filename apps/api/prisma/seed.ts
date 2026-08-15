import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Synthetic seed data only — fictional branches and staff, never anything from
 * the real business (Handbook §6).
 *
 * Two things here are load-bearing rather than convenience:
 *  - the initial OWNER, because user creation is OWNER-only with no
 *    self-registration, so without it nobody can ever log in (ADR-011 §5);
 *  - the system categories, because LedgerEntry.categoryId is required, so a
 *    sale or settlement could not generate its entry without them (ADR-012).
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const branches = await Promise.all(
    ['Cabang Melati', 'Cabang Kenanga'].map((name) =>
      prisma.branch.upsert({
        where: { name },
        update: {},
        create: { name, address: `Jl. ${name} No. 1` },
      }),
    ),
  );

  await Promise.all([
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

  console.log(`Seeded. Owner login: ${ownerEmail}`);
  await prisma.$disconnect();
}

void main();
