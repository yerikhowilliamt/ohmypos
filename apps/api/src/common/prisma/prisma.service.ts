import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Maps `connection_limit` / `pool_timeout` from DATABASE_URL onto `pg.Pool`,
 * which otherwise ignores them and keeps its default of 10 connections.
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
 * The raw client, with no tenant filter.
 *
 * Inject only where the README allows it (auth lookup, guards, platform module,
 * scripts, multi-tenant fixtures). Anywhere else, use `PrismaService`.
 */
@Injectable()
export class UnscopedPrismaService
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

/**
 * The tenant-scoped client every module injects. Only a DI token and type:
 * `PrismaModule` provides the extended unscoped client under it.
 *
 * Throws `TenantContextMissingError` when no tenant is in scope.
 */
@Injectable()
export class PrismaService extends UnscopedPrismaService {}
