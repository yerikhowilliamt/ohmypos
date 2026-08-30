import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { UnscopedPrismaService } from '../src/common/prisma/prisma.service';

/**
 * ADR-025 Fase 3 — bootstrap for the platform console.
 *
 * There is no `POST /platform/admins` endpoint and this script is the only way
 * a platform admin comes into existence, deliberately: the first one cannot be
 * created through an authenticated API, and an unauthenticated one would be the
 * single worst endpoint in the system. Shell access is the authentication.
 *
 * Mirrors `create-owner.ts` (interactive prompts, bcrypt 10 rounds) with one
 * structural difference: it never opens a tenant scope and only ever touches
 * `UnscopedPrismaService`, because a platform admin belongs to no tenant.
 */

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
    console.log('--- CLI Pembuatan Akun SUPER ADMIN OhMyPos ---\n');
    console.log(
      'Akun ini dapat melihat dan menangguhkan SELURUH tenant. Buat hanya untuk operator platform.\n',
    );
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

  // Twelve, not the eight `create-owner.ts` accepts: this one credential can
  // read and suspend every tenant in the system.
  if (!password || password.length < 12) {
    console.error('Error: Password super admin wajib minimal 12 karakter.');
    process.exit(1);
  }

  const prisma = new UnscopedPrismaService();

  try {
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      console.error(
        `Error: Super admin dengan email ${normalizedEmail} sudah terdaftar.`,
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await prisma.platformAdmin.create({
      data: { name, email: normalizedEmail, passwordHash, isActive: true },
    });

    console.log('\nAkun SUPER ADMIN berhasil dibuat:');
    console.log(`- ID    : ${admin.id}`);
    console.log(`- Nama  : ${admin.name}`);
    console.log(`- Email : ${admin.email}`);
    console.log('\nMasuk melalui /platform/login, bukan halaman login biasa.');
  } catch (error) {
    console.error('Gagal membuat akun super admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
