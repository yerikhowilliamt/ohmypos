#!/usr/bin/env node
// Buang .next/dev + .next/cache kalau sudah melewati ambang batas (default 1 GB).
// Dijalankan sebelum `next dev`, jadi tetap bekerja walau sesi sebelumnya di-kill -9
// atau laptop mati — tidak bergantung pada trap/signal handler yang bisa terlewat.
// Ambang bisa diatur per-run: NEXT_CACHE_LIMIT_GB=2 pnpm dev
import { rmSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const LIMIT_BYTES = Number(process.env.NEXT_CACHE_LIMIT_GB ?? 1) * 1024 ** 3;
const targets = ['.next/dev', '.next/cache'];

let total = 0;
for (const dir of targets) {
  try {
    statSync(dir);
    total += Number(execSync(`du -sk "${dir}"`).toString().split('\t')[0]) * 1024;
  } catch {
    /* belum ada, abaikan */
  }
}

if (total > LIMIT_BYTES) {
  for (const dir of targets) rmSync(dir, { recursive: true, force: true });
  console.log(
    `[prune] Next dev cache ${(total / 1024 ** 3).toFixed(1)} GB melewati batas ` +
      `${(LIMIT_BYTES / 1024 ** 3).toFixed(1)} GB — dihapus.`,
  );
}
