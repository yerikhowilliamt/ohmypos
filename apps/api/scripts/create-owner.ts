import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import {
  PrismaService,
  UnscopedPrismaService,
} from '../src/common/prisma/prisma.service';
import { enterTenantScope } from '../src/common/prisma/tenant-context';
import { tenantExtension } from '../src/common/prisma/tenant.extension';
import { ensureSystemRefs } from '../src/common/system-refs';

function askQuestion(query: string, hideText = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (!hideText) {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(query);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    let password = '';
    const onData = (charBuffer: Buffer) => {
      const char = charBuffer.toString('utf-8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) {
          stdin.setRawMode(wasRaw || false);
        }
        stdin.pause();
        process.stdout.write('\n');
        rl.close();
        resolve(password.trim());
      } else if (char === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = 'true';
      }
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs();
  let name = args.name || args.fullName;
  let email = args.email;
  let password = args.password;

  if (!name || !email || !password) {
    console.log('--- CLI Pembuatan Akun OWNER OhMyPos ---\n');
  }

  if (!name) {
    name = await askQuestion('Nama Lengkap: ');
  }
  if (!email) {
    email = await askQuestion('Email: ');
  }
  if (!password) {
    password = await askQuestion('Password: ', true);
  }

  if (!name || name.length < 2) {
    console.error('Error: Nama lengkap wajib diisi minimal 2 karakter.');
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    console.error('Error: Format email tidak valid.');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('Error: Password wajib minimal 8 karakter.');
    process.exit(1);
  }

  const unscoped = new UnscopedPrismaService();

  try {
    // ADR-025 — this is the v1 bootstrap path, so it adopts (or creates) the
    // single default tenant. Additional tenants are created through
    // `POST /platform/tenants`, which seeds the same system refs in one
    // transaction.
    const tenant =
      (await unscoped.tenant.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await unscoped.tenant.create({
        data: { name: 'OhMyPos', slug: 'default' },
      }));
    enterTenantScope(tenant.id);
    const prisma = unscoped.$extends(
      tenantExtension,
    ) as unknown as PrismaService;

    const normalizedEmail = email.toLowerCase();
    // Unscoped: `User.email` is globally unique (ADR-025 Decision 6), so the
    // collision to report is a collision across ALL tenants, not just this one.
    const existing = await unscoped.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      console.error(`Error: User dengan email ${normalizedEmail} sudah terdaftar.`);
      process.exit(1);
    }

    // A fresh install has no system refs, and without them the first sale and
    // the first central purchase both fail with a 503. Idempotent, so running
    // this script again on a live database changes nothing.
    await ensureSystemRefs(prisma);

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role: 'OWNER',
        branchId: null,
        isActive: true,
      },
    });

    console.log('\nAkun OWNER berhasil dibuat:');
    console.log(`- ID    : ${user.id}`);
    console.log(`- Nama  : ${user.name}`);
    console.log(`- Email : ${user.email}`);
    console.log(`- Role  : ${user.role}`);

    console.log(`- Tenant: ${tenant.name} (${tenant.slug})`);

    console.log('\nData sistem siap:');
    console.log('- Lokasi  : Umum');
    console.log('- Kategori: Penjualan, Pembelian Bahan Baku');
    console.log(
      '\nLangkah berikutnya: buat minimal satu Akun (kas/bank) di halaman Akun, lalu buat toko pertama di halaman Cabang — toko pertama otomatis menjadi Toko Utama.',
    );
  } catch (error) {
    console.error('Gagal membuat akun owner:', error);
    process.exit(1);
  } finally {
    await unscoped.$disconnect();
  }
}

main();
