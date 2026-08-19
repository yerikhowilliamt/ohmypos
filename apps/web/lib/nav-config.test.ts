import { describe, expect, it } from 'vitest';
import { getNavItems } from './nav-config';

describe('getNavItems', () => {
  it('returns only /sales for KASIR', () => {
    expect(getNavItems('KASIR').map((item) => item.href)).toEqual(['/sales']);
  });

  it('returns master-data, accounts, and reconciliation for ADMIN', () => {
    expect(getNavItems('ADMIN').map((item) => item.href)).toEqual([
      '/master-data',
      '/accounts',
      '/reconciliation',
    ]);
  });

  it('returns all nine back-office routes for OWNER, dashboard first, and never /sales', () => {
    const hrefs = getNavItems('OWNER').map((item) => item.href);
    expect(hrefs).toEqual([
      '/dashboard',
      '/master-data',
      '/accounts',
      '/reconciliation',
      '/expenses',
      '/inventory',
      '/reports',
      '/users',
      '/branches',
    ]);
    expect(hrefs[0]).toBe('/dashboard');
    expect(hrefs).not.toContain('/sales');
  });

  it('does not expose /dashboard to ADMIN or KASIR', () => {
    expect(getNavItems('ADMIN').map((item) => item.href)).not.toContain(
      '/dashboard',
    );
    expect(getNavItems('KASIR').map((item) => item.href)).not.toContain(
      '/dashboard',
    );
  });
});
