import { describe, expect, it } from 'vitest';
import type { UserRole } from '@ohmypos/api-contracts';
import { getNavItems } from './nav-config';
import {
  HELP_CATEGORY_LABELS,
  HELP_CATEGORY_ORDER,
  HELP_SECTIONS,
  filterHelpSections,
  getHelpSections,
  groupHelpSections,
} from './help-content';

const ROLES: UserRole[] = ['KASIR', 'ADMIN', 'OWNER'];

/** Every sidebar destination a role can reach, parents and children alike. */
function navRoutesFor(role: UserRole): string[] {
  const routes = new Set<string>();
  for (const item of getNavItems(role)) {
    routes.add(item.href);
    for (const child of item.children ?? []) routes.add(child.href);
  }
  // The help page does not document itself.
  routes.delete('/help');
  return [...routes];
}

/**
 * The reason this file exists. The help page had drifted to 9 topics while the
 * app grew to 35 pages, and nothing failed — documentation gaps are invisible
 * to a compiler. This test makes them visible: add a page to the sidebar
 * without a help topic covering it, and CI fails here.
 */
describe('help content covers every page in the sidebar', () => {
  for (const role of ROLES) {
    it(`documents every route a ${role} can open`, () => {
      const covered = new Set(
        getHelpSections(role).flatMap((section) => section.covers),
      );
      const missing = navRoutesFor(role).filter((href) => !covered.has(href));
      expect(missing).toEqual([]);
    });
  }

  it('claims no route that is not in anyone’s sidebar', () => {
    const real = new Set(ROLES.flatMap(navRoutesFor));
    const claimed = HELP_SECTIONS.flatMap((section) => section.covers);
    expect(claimed.filter((href) => !real.has(href))).toEqual([]);
  });

  it('never lets a role claim coverage of a page it cannot open', () => {
    // A section visible to KASIR that "covers" /reports would satisfy the
    // coverage test above while documenting a page the cashier can never see.
    for (const section of HELP_SECTIONS) {
      for (const role of section.roles) {
        const reachable = new Set(navRoutesFor(role));
        for (const href of section.covers) {
          expect(
            reachable.has(href),
            `section "${section.id}" is shown to ${role} but covers ${href}, which ${role} cannot open`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('help content structure', () => {
  it('has unique ids', () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every section at least one role and one block', () => {
    for (const section of HELP_SECTIONS) {
      expect(section.roles.length, section.id).toBeGreaterThan(0);
      expect(section.blocks.length, section.id).toBeGreaterThan(0);
      expect(section.summary.trim(), section.id).not.toBe('');
    }
  });

  it('orders and labels every category that content uses', () => {
    for (const section of HELP_SECTIONS) {
      expect(HELP_CATEGORY_ORDER, section.id).toContain(section.category);
      expect(HELP_CATEGORY_LABELS[section.category]).toBeTruthy();
    }
  });

  it('starts every role with the concepts, not the click-paths', () => {
    for (const role of ROLES) {
      const groups = groupHelpSections(getHelpSections(role));
      expect(groups[0]?.category, role).toBe('konsep');
    }
  });
});

describe('role scoping', () => {
  it('keeps Owner-only topics away from a Kasir', () => {
    const kasirIds = getHelpSections('KASIR').map((s) => s.id);
    expect(kasirIds).not.toContain('payables');
    expect(kasirIds).not.toContain('reports');
    expect(kasirIds).toContain('pos-sale');
  });

  it('gives an Admin the master-data topics but not the money ones', () => {
    const adminIds = getHelpSections('ADMIN').map((s) => s.id);
    expect(adminIds).toContain('reconciliation');
    expect(adminIds).toContain('raw-materials');
    expect(adminIds).not.toContain('expenses-general');
    expect(adminIds).not.toContain('dashboard');
  });
});

describe('search', () => {
  const owner = getHelpSections('OWNER');

  it('returns everything for an empty query', () => {
    expect(filterHelpSections(owner, '   ')).toHaveLength(owner.length);
  });

  it('finds a topic by a word that appears only in its body', () => {
    // "jatuh tempo" is in the payables keywords, not in any title.
    const ids = filterHelpSections(owner, 'jatuh tempo').map((s) => s.id);
    expect(ids).toContain('payables');
  });

  it('finds the Umum explainer, the question that prompted this page', () => {
    const ids = filterHelpSections(owner, 'umum').map((s) => s.id);
    expect(ids).toContain('konsep-umum-vs-semua-cabang');
  });

  it('is case-insensitive', () => {
    expect(filterHelpSections(owner, 'HPP').map((s) => s.id)).toContain(
      'konsep-resep-hpp',
    );
  });

  it('returns nothing for a word the content does not contain', () => {
    expect(filterHelpSections(owner, 'zzzznotatopic')).toEqual([]);
  });
});

describe('grouping', () => {
  it('drops categories with no visible section', () => {
    const groups = groupHelpSections(getHelpSections('KASIR'));
    const categories = groups.map((g) => g.category);
    expect(categories).not.toContain('laporan');
    expect(groups.every((g) => g.sections.length > 0)).toBe(true);
  });

  it('follows the declared category order', () => {
    const groups = groupHelpSections(getHelpSections('OWNER'));
    const order = groups.map((g) => HELP_CATEGORY_ORDER.indexOf(g.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
