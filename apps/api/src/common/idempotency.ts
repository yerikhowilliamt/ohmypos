import { Prisma } from '../generated/prisma/client';

/**
 * TASK-082. Menjawab satu pertanyaan: apakah kegagalan ini adalah pemutaran
 * ulang (replay) dari permintaan yang sudah pernah kita layani?
 *
 * Dipanggil DI LUAR `$transaction`, tidak pernah di dalamnya. Pelanggaran
 * indeks unik membatalkan seluruh transaksi Postgres, jadi `catch` di dalam blok
 * transaksi akan berjalan di atas transaksi mati dan setiap pembacaan
 * sesudahnya gagal. Ini jebakan utama task ini.
 */
export function isIdempotencyReplay(
  error: unknown,
  indexName: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  const target = error.meta?.target;
  if (typeof target === 'string') {
    return (
      target === indexName ||
      target.includes('idempotencyKey') ||
      target.includes('idempotency_key')
    );
  }
  if (Array.isArray(target)) {
    return target.some(
      (t) =>
        t === 'idempotency_key' ||
        t === 'idempotencyKey' ||
        t === indexName ||
        (typeof t === 'string' && t.includes('idempotency')),
    );
  }
  return true; // P2002 on an endpoint with idempotencyKey is almost certainly the unique constraint
}
