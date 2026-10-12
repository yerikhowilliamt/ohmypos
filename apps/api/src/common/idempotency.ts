import { Prisma } from '../generated/prisma/client';

/**
 * Whether `error` is a unique violation on an idempotency key, i.e. a replay.
 *
 * Call it outside `$transaction`: a unique violation aborts the Postgres
 * transaction, so any read inside it would fail.
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
