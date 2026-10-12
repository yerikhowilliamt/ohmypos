import { Prisma } from '../../generated/prisma/client';

/** SQLSTATE of `RAISE EXCEPTION` in PL/pgSQL, raised by domain triggers. */
export const PG_RAISE_EXCEPTION = 'P0001';

/** Prisma 7 nests the Postgres error under `meta.driverAdapterError.cause` (P2039). */
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

/** The underlying Postgres error of a Prisma error, or null if none. */
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
