import { Prisma } from '../../generated/prisma/client';
import { REPORT_TIMEZONE, type ReportRange } from '../../common/period';
import { currentTenantId } from '../../common/prisma/tenant-context';

/**
 * `<alias>.tenant_id = <current tenant>`. Raw SQL bypasses the Prisma tenant
 * extension, so every report query must include this (ADR-025).
 *
 * @throws Error when no tenant is in scope; never returns an unfiltered fragment.
 */
export function tenantScope(alias: 'le' | 's' | 'a'): Prisma.Sql {
  const tenantId = currentTenantId();
  if (!tenantId) {
    throw new Error(
      'Report query attempted with no tenant in scope — refusing to run an unscoped aggregate.',
    );
  }
  switch (alias) {
    case 'le':
      return Prisma.sql`le.tenant_id = ${tenantId}`;
    case 's':
      return Prisma.sql`s.tenant_id = ${tenantId}`;
    case 'a':
      return Prisma.sql`a.tenant_id = ${tenantId}`;
  }
}

/** `le.tenant_id = ... AND le.entry_date >= from AND le.entry_date < to [AND le.branch_id = ...]` */
export function ledgerScope(range: ReportRange, branchId?: string): Prisma.Sql {
  const branch = branchId
    ? Prisma.sql` AND le.branch_id = ${branchId}`
    : Prisma.empty;
  return Prisma.sql`${tenantScope('le')} AND le.entry_date >= ${range.from} AND le.entry_date < ${range.to}${branch}`;
}

/**
 * `s.tenant_id = ... AND s.sold_at >= from AND s.sold_at < to AND s.status <> 'VOIDED' [AND s.branch_id = ...]`
 *
 * Excludes voided sales for sale-side queries only; ledger-side revenue
 * queries exclude them separately (DEBT-010, see README).
 */
export function saleScope(range: ReportRange, branchId?: string): Prisma.Sql {
  const branch = branchId
    ? Prisma.sql` AND s.branch_id = ${branchId}`
    : Prisma.empty;
  return Prisma.sql`${tenantScope('s')} AND s.sold_at >= ${range.from} AND s.sold_at < ${range.to} AND s.status <> 'VOIDED'${branch}`;
}

/**
 * The WIB calendar day of `le.entry_date`, as `YYYY-MM-DD` text.
 *
 * Both `AT TIME ZONE` conversions are required: the column is a UTC instant
 * without time zone (ADR-018).
 */
export function wibDayOfEntryDate(): Prisma.Sql {
  return Prisma.sql`to_char(((le.entry_date AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIMEZONE})::date, 'YYYY-MM-DD')`;
}

/** The WIB calendar day of `s.sold_at`, as `YYYY-MM-DD` text. */
export function wibDayOfSoldAt(): Prisma.Sql {
  return Prisma.sql`to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIMEZONE})::date, 'YYYY-MM-DD')`;
}
