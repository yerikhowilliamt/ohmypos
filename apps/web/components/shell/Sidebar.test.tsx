import * as React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { Sidebar } from './Sidebar';

const pathnameMock = vi.fn<() => string>(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => ({})),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

/** Drives `useIsRail` — `matches` true means the 768–1023px band. */
function setViewport(isRail: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('max-width: 1023px') ? isRail : !isRail,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  });
}

const owner: UserResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Yerikho William',
  email: 'owner@ohmypos.test',
  role: 'OWNER',
  branchId: null,
  isActive: true,
  photoUrl: null,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard');
  setViewport(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Sidebar — expanded (>=1024px)', () => {
  it('renders the brand, search, Menu label, and account card', () => {
    renderWithClient(<Sidebar user={owner} />);
    expect(screen.getByTestId('sidebar-search')).toBeInTheDocument();
    expect(screen.getByText('Menu')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-account-card')).toBeInTheDocument();
    expect(screen.getByText('Yerikho William')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('marks the active item with a tinted pill, never a saturated fill', () => {
    renderWithClient(<Sidebar user={owner} />);
    const active = screen.getByRole('link', { name: 'Dashboard' });
    expect(active).toHaveAttribute('aria-current', 'page');
    // DESIGN.md §16 forbids a fully saturated active background.
    expect(active.className).toContain('bg-surface-strong');
    expect(active.className).not.toContain('bg-brand-primary');
  });

  it('filters the nav list from the sidebar search', () => {
    renderWithClient(<Sidebar user={owner} />);
    fireEvent.change(screen.getByTestId('sidebar-search'), {
      target: { value: 'utang' },
    });
    expect(screen.getByTestId('nav-group-/expenses')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it('shows an empty message when the search matches nothing', () => {
    renderWithClient(<Sidebar user={owner} />);
    fireEvent.change(screen.getByTestId('sidebar-search'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('Menu tidak ditemukan.')).toBeInTheDocument();
  });

  it('auto-expands the group containing the current route', () => {
    pathnameMock.mockReturnValue('/sales/history');
    renderWithClient(<Sidebar user={owner} />);
    const child = screen.getByRole('link', { name: 'Riwayat Transaksi' });
    expect(child).toHaveAttribute('aria-current', 'page');
    // Only the leaf is current — the sibling leaf sharing the /sales prefix
    // must not also be marked.
    expect(
      screen.getByRole('link', { name: 'Transaksi Kasir' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('renders only the routes a KASIR can reach', () => {
    renderWithClient(<Sidebar user={{ ...owner, role: 'KASIR' }} />);
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.getByTestId('nav-group-/sales')).toBeInTheDocument();
  });
});

describe('Sidebar — rail (768–1023px)', () => {
  beforeEach(() => setViewport(true));

  it('collapses to a 64px icon rail with no search input', () => {
    renderWithClient(<Sidebar user={owner} />);
    const aside = screen.getByTestId('sidebar');
    expect(aside).toHaveAttribute('data-rail', 'true');
    expect(aside.className).toContain('w-16');
    expect(screen.queryByTestId('sidebar-search')).toBeNull();
    expect(screen.queryByText('Menu')).toBeNull();
  });

  it('keeps every destination reachable by accessible name', () => {
    renderWithClient(<Sidebar user={owner} />);
    // §43: the tooltip is hover-only, so the label also lives on aria-label.
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('nav-rail-group-/sales')).toBeInTheDocument();
  });

  it('collapses the account card to an avatar trigger', () => {
    renderWithClient(<Sidebar user={owner} />);
    expect(screen.queryByTestId('sidebar-account-card')).toBeNull();
    expect(screen.getByTestId('sidebar-account-trigger')).toBeInTheDocument();
  });
});
