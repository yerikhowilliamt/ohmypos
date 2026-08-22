import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * `connection_limit`/`pool_timeout` query-string params are a Prisma
 * classic-engine convention — `pg`/`pg-connection-string` (what the driver
 * adapter actually uses) does not read them from the connection string at
 * all, so a DATABASE_URL carrying them silently keeps `pg.Pool`'s default of
 * 10 connections. Phase 14's concurrency suite (B1-B4, 30-50 way) measured
 * this directly: `connection_limit=60` in `.env.test` had no effect and
 * concurrency above ~10 surfaced as ECONNRESET, not a clean 500. Parsed here
 * and passed to `pg.Pool` explicitly so the parameter does what its name says.
 */
function poolConfigFromUrl(connectionString: string | undefined) {
  if (!connectionString) return { connectionString };

  const url = new URL(connectionString);
  const connectionLimit = url.searchParams.get('connection_limit');
  const poolTimeoutSeconds = url.searchParams.get('pool_timeout');

  return {
    connectionString,
    max: connectionLimit ? Number(connectionLimit) : undefined,
    connectionTimeoutMillis: poolTimeoutSeconds
      ? Number(poolTimeoutSeconds) * 1000
      : undefined,
  };
}

/**
 * Ported from Kasync with one required change: Prisma 7 connects through a
 * driver adapter rather than a `url` in the schema, so the connection string is
 * passed here instead of being read by the engine.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg(poolConfigFromUrl(process.env.DATABASE_URL)),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
