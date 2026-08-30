import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { UnscopedPrismaService } from '../src/common/prisma/prisma.service';

/**
 * TASK-130 Bagian B2 — the last recovery floor for the platform console.
 *
 * `PATCH /platform/auth/password` requires the CURRENT password, which is
 * exactly what the person running this does not have. And unlike every other
 * account in the system, a platform admin has nobody above them: staff are
 * reset by their OWNER, an OWNER by a platform admin, and a platform admin by
 * this script. Database access is the authentication, the same way it is for
 * `create-platform-admin.ts`, whose prompts and bcrypt cost this mirrors.
 *
 * NOT shipped in the production image — the runtime stage of `Dockerfile`
 * copies `dist`, `prisma`, `src/generated`, `package.json` and `node_modules`,
 * not `scripts/`. Run it from a local machine with `DATABASE_URL` pointed at
 * the deployed database; see `docs/runbooks/platform-admin-recovery.md`.
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
  let email = args.email;
  let password = args.password;

  if (!email || !password) {
    console.log('--- CLI Reset Kata Sandi SUPER ADMIN OhMyPos ---\n');
    console.log(
      'Gunakan ini hanya kalau tidak ada seorang pun bisa masuk ke konsol platform.\n',
    );
  }

  if (!email) {
    email = await askQuestion('Email super admin: ');
  }
  if (!password) {
    password = await askQuestion('Kata sandi baru: ', true);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    console.error('Error: Format email tidak valid.');
    process.exit(1);
  }

  // The same twelve `create-platform-admin.ts` enforces. A recovery path that
  // accepts a weaker password is a way to lower that standard, not to restore
  // access under it.
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

    if (!existing) {
      console.error(
        `Error: Tidak ada super admin dengan email ${normalizedEmail}. Periksa ejaannya, atau buat akun baru dengan "pnpm --filter api create:platform-admin".`,
      );
      process.exit(1);
    }

    const admin = await prisma.platformAdmin.update({
      where: { id: existing.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        // All three, not just the hash. Leaving the refresh token and
        // `tokenValidFrom` untouched would keep every old session alive —
        // which contradicts the reason anyone runs this script.
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    // The password itself is never printed and never logged (Playbook §9).
    console.log('\nKata sandi SUPER ADMIN berhasil direset:');
    console.log(`- Email : ${admin.email}`);
    console.log(`- Waktu : ${admin.tokenValidFrom.toISOString()}`);
    console.log(
      '\nSeluruh sesi lama akun ini sudah dicabut. Masuk melalui /platform/login.',
    );
  } catch (error) {
    console.error('Gagal mereset kata sandi super admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
