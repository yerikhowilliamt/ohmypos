import * as React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { SidebarProvider, useSidebar } from '@ohmypos/ui/components/sidebar';
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

/** `AppShell` normally derives `isMobile`/`open` from `useIsRail`/
 * `useIsMobile` — the sidebar itself no longer reads breakpoints directly,
 * so the test drives the same two booleans explicitly instead of mocking
 * `matchMedia`. */
function renderSidebar(
  user: UserResponse,
  { isRail = false, isMobile = false } = {},
) {
  return renderWithClient(
    <SidebarProvider isMobile={isMobile} open={!isRail}>
      <Sidebar user={user} />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Sidebar — expanded (>=1024px)', () => {
  it('renders the brand, search, Menu label, and account card', () => {
    renderSidebar(owner);
    expect(screen.getByTestId('sidebar-search')).toBeInTheDocument();
    expect(screen.getByText('Menu')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-account-card')).toBeInTheDocument();
    expect(screen.getByText('Yerikho William')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('marks the active item with a tinted pill, never a saturated fill', () => {
    renderSidebar(owner);
    const active = screen.getByRole('link', { name: 'Dashboard' });
    expect(active).toHaveAttribute('aria-current', 'page');
    // DESIGN.md §10.2 Sidebar Specifications forbids a fully saturated active background.
    expect(active.className).toContain('bg-sidebar-accent');
    expect(active.className).not.toContain('bg-brand-primary');
  });

  it('filters the nav list from the sidebar search', () => {
    renderSidebar(owner);
    fireEvent.change(screen.getByTestId('sidebar-search'), {
      target: { value: 'utang' },
    });
    expect(screen.getByTestId('nav-group-/expenses')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it('shows an empty message when the search matches nothing', () => {
    renderSidebar(owner);
    fireEvent.change(screen.getByTestId('sidebar-search'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('Menu tidak ditemukan.')).toBeInTheDocument();
  });

  it('auto-expands the group containing the current route', () => {
    pathnameMock.mockReturnValue('/sales/history');
    renderSidebar(owner);
    const child = screen.getByRole('link', { name: 'Riwayat Transaksi' });
    expect(child).toHaveAttribute('aria-current', 'page');
    // Only the leaf is current — the sibling leaf sharing the /sales prefix
    // must not also be marked.
    expect(
      screen.getByRole('link', { name: 'Transaksi Penjualan' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('renders only the routes a KASIR can reach', () => {
    renderSidebar({ ...owner, role: 'KASIR' });
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.getByTestId('nav-group-/sales')).toBeInTheDocument();
  });
});

describe('Sidebar — rail (768–1023px)', () => {
  it('collapses to a 64px icon rail with no search input', () => {
    renderSidebar(owner, { isRail: true });
    const aside = screen.getByTestId('sidebar');
    expect(aside).toHaveAttribute('data-rail', 'true');
    expect(aside).toHaveAttribute('data-state', 'collapsed');
    expect(screen.queryByTestId('sidebar-search')).toBeNull();
    expect(screen.queryByText('Menu')).toBeNull();
  });

  it('keeps every destination reachable by accessible name', () => {
    renderSidebar(owner, { isRail: true });
    // §43: the tooltip is hover-only, so the label also lives on aria-label.
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('nav-rail-group-/sales')).toBeInTheDocument();
  });

  it('collapses the account card to an avatar trigger', () => {
    renderSidebar(owner, { isRail: true });
    expect(screen.queryByTestId('sidebar-account-card')).toBeNull();
    expect(screen.getByTestId('sidebar-account-trigger')).toBeInTheDocument();
  });
});

/** `SidebarProvider`'s mobile Sheet only mounts its content once
 * `openMobile` is true — in the real app that happens via `Topbar`'s
 * hamburger, so this stand-in exposes the same `setOpenMobile` call. */
function OpenMobileSidebarButton() {
  const { setOpenMobile } = useSidebar();
  return (
    <button type="button" onClick={() => setOpenMobile(true)}>
      Buka menu
    </button>
  );
}

describe('Sidebar — mobile (<768px)', () => {
  it('renders inside a dialog with the same active-state styling as desktop', () => {
    renderWithClient(
      <SidebarProvider isMobile open={false}>
        <OpenMobileSidebarButton />
        <Sidebar user={owner} />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByText('Buka menu'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const active = screen.getByRole('link', { name: 'Dashboard' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('bg-sidebar-accent');
  });
});
