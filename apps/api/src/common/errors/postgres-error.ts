import { Prisma } from '../../generated/prisma/client';

/**
 * PostgreSQL's SQLSTATE for `RAISE EXCEPTION` in a PL/pgSQL function — what both
 * `trg_check_allocation_sum` and any future domain trigger raise.
 */
export const PG_RAISE_EXCEPTION = 'P0001';

/**
 * Prisma 7 reports a driver-adapter failure as P2039 and nests the real
 * PostgreSQL error underneath, rather than Prisma 5's P2010/P2034 with the
 * message inlined in `meta`. Kasync's filter matched on the old shape, so it
 * cannot be ported verbatim — a trigger rejection would have fallen through to
 * HTTP 500 instead of 400. Verified against Postgres 16 with Prisma 7.9.1.
 */
interface DriverAdapterCause {
  code?: string;
  message?: string;
  originalCode?: string;
  originalMessage?: string;
}

interface DriverAdapterErrorMeta {
  driverAdapterError?: {
    cause?: DriverAdapterCause;
  };
}

/**
 * Pulls the underlying PostgreSQL error out of a Prisma error, whichever shape
 * the client used. Returns null when the error did not originate in the database.
 */
export function extractPostgresError(
  error: unknown,
): { code: string; message: string } | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  const meta = error.meta as DriverAdapterErrorMeta | undefined;
  const cause = meta?.driverAdapterError?.cause;

  if (!cause) {
    return null;
  }

  const code = cause.originalCode ?? cause.code;
  const message = cause.originalMessage ?? cause.message;

  if (!code || !message) {
    return null;
  }

  return { code, message };
}
