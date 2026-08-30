/**
 * OhMyPos — unit tests for the report SQL fragments (plan §6.6).
 *
 * These assert PARAMETERISATION, not SQL semantics: that user input lands in
 * `values` and never in the SQL text, and that the branch predicate is absent
 * (not `AND TRUE`) when no branch is filtered.
 *
 * ADR-025 added a third thing worth asserting: every fragment leads with a
 * BOUND `tenant_id` predicate. Raw SQL is the one place the Prisma extension
 * cannot help, so `tenantId` being first in `values` is the check that a report
 * cannot be run unscoped.
 */
import { resolveReportRange } from '../../common/period';
import { runWithTenant } from '../../common/prisma/tenant-context';
import {
  ledgerScope,
  saleScope,
  wibDayOfEntryDate,
  wibDayOfSoldAt,
} from './report-filters';

describe('Report SQL fragments (report-filters.ts)', () => {
  const range = resolveReportRange('2025-03-01', '2025-03-31');
  const branchId = '11111111-1111-4111-8111-111111111111';
  const tenantId = '99999999-9999-4999-8999-999999999999';

  /** Every fragment below is built inside a tenant scope, as the API does. */
  const scoped = <T>(fn: () => T): T => runWithTenant(tenantId, fn);

  it('binds only the two dates when no branch is filtered', () => {
    const sql = scoped(() => ledgerScope(range));
    expect(sql.values).toEqual([tenantId, range.from, range.to]);
    expect(sql.sql).toContain('le.tenant_id');
    expect(sql.sql).not.toContain('branch_id');
  });

  it('binds the branch id as a parameter, never inline', () => {
    const sql = scoped(() => ledgerScope(range, branchId));
    expect(sql.values).toEqual([tenantId, range.from, range.to, branchId]);
    expect(sql.sql).toContain('le.branch_id');
    expect(sql.sql).not.toContain(branchId);
  });

  it('scopes sales on the parent sale, not on sale_items', () => {
    const sql = scoped(() => saleScope(range, branchId));
    expect(sql.sql).toContain('s.sold_at');
    expect(sql.sql).toContain('s.branch_id');
    expect(sql.sql).not.toContain('si.');
    expect(sql.values).toEqual([tenantId, range.from, range.to, branchId]);
  });

  it('omits the branch predicate entirely when no branch is given', () => {
    expect(scoped(() => saleScope(range)).sql).not.toContain('branch_id');
  });

  it('converts UTC to WIB in two steps and binds the timezone name', () => {
    const sql = wibDayOfEntryDate();
    // Two conversions: one out of the naive-UTC column, one into WIB.
    expect(sql.sql.match(/AT TIME ZONE/g)).toHaveLength(2);
    expect(sql.sql).toContain(`'UTC'`);
    expect(sql.sql).toContain('to_char');
    expect(sql.values).toEqual(['Asia/Jakarta']);
  });

  it('buckets by the sale date, not the ledger entry date', () => {
    const sql = wibDayOfSoldAt();
    expect(sql.sql.match(/AT TIME ZONE/g)).toHaveLength(2);
    expect(sql.sql).toContain('s.sold_at');
    expect(sql.sql).not.toContain('le.entry_date');
    expect(sql.sql).toContain('to_char');
    expect(sql.values).toEqual(['Asia/Jakarta']);
  });

  it('refuses to build a fragment with no tenant in scope', () => {
    // Fail closed: an unscoped aggregate would sum every tenant's money.
    expect(() => ledgerScope(range)).toThrow(/no tenant in scope/);
    expect(() => saleScope(range)).toThrow(/no tenant in scope/);
  });
});
