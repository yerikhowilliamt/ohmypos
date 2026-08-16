import { describe, expect, it } from 'vitest';
import { getNavItems } from './nav-config';

describe('getNavItems', () => {
  it('returns only /sales for KASIR', () => {
    expect(getNavItems('KASIR').map((item) => item.href)).toEqual(['/sales']);
  });

  it('returns master-data and reconciliation for ADMIN, and nothing else', () => {
    expect(getNavItems('ADMIN').map((item) => item.href)).toEqual([
      '/master-data',
      '/reconciliation',
    ]);
  });

  it('returns all six back-office routes for OWNER, and never /sales', () => {
    const hrefs = getNavItems('OWNER').map((item) => item.href);
    expect(hrefs).toEqual([
      '/master-data',
      '/reconciliation',
      '/expenses',
      '/inventory',
      '/reports',
      '/users',
    ]);
    expect(hrefs).not.toContain('/sales');
  });
});
