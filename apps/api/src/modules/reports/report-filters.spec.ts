/**
 * OhMyPos — unit tests for the report SQL fragments (plan §6.6).
 *
 * These assert PARAMETERISATION, not SQL semantics: that user input lands in
 * `values` and never in the SQL text, and that the branch predicate is absent
 * (not `AND TRUE`) when no branch is filtered.
 */
import { resolveReportRange } from '../../common/period';
import {
  ledgerScope,
  saleScope,
  wibDayOfEntryDate,
  wibDayOfSoldAt,
} from './report-filters';

describe('Report SQL fragments (report-filters.ts)', () => {
  const range = resolveReportRange('2025-03-01', '2025-03-31');
  const branchId = '11111111-1111-4111-8111-111111111111';

  it('binds only the two dates when no branch is filtered', () => {
    const sql = ledgerScope(range);
    expect(sql.values).toEqual([range.from, range.to]);
    expect(sql.sql).not.toContain('branch_id');
  });

  it('binds the branch id as a parameter, never inline', () => {
    const sql = ledgerScope(range, branchId);
    expect(sql.values).toEqual([range.from, range.to, branchId]);
    expect(sql.sql).toContain('le.branch_id');
    expect(sql.sql).not.toContain(branchId);
  });

  it('scopes sales on the parent sale, not on sale_items', () => {
    const sql = saleScope(range, branchId);
    expect(sql.sql).toContain('s.sold_at');
    expect(sql.sql).toContain('s.branch_id');
    expect(sql.sql).not.toContain('si.');
    expect(sql.values).toEqual([range.from, range.to, branchId]);
  });

  it('omits the branch predicate entirely when no branch is given', () => {
    expect(saleScope(range).sql).not.toContain('branch_id');
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
});
