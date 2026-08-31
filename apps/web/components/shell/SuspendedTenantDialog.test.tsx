import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SuspendedTenantDialog } from './SuspendedTenantDialog';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

/**
 * TASK-132. Two properties matter and neither is cosmetic: the modal must say
 * that it is the BUSINESS that was suspended and not the account (the owner's
 * first assumption is that they typed their password wrong), and it must not be
 * dismissable — everything behind it is refused by `TenantStatusGuard`, so a
 * dismissed modal leaves someone poking at an application that silently says no
 * to everything.
 */
describe('SuspendedTenantDialog', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({});
  });

  it('separates the suspended business from the working account', () => {
    render(<SuspendedTenantDialog />);
    expect(
      screen.getByText('Akses bisnis ini sedang ditangguhkan'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/yang ditangguhkan adalah\s+bisnisnya, bukan akun Anda/),
    ).toBeInTheDocument();
  });

  it('says who can lift the suspension', () => {
    render(<SuspendedTenantDialog />);
    expect(
      screen.getByText(/Hubungi admin OhMyPos untuk membuka penangguhan/),
    ).toBeInTheDocument();
  });

  it('offers exactly one action, and it is the one that still works', () => {
    render(<SuspendedTenantDialog />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Keluar');
  });

  it('cannot be dismissed with Escape', () => {
    render(<SuspendedTenantDialog />);
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(
      screen.getByText('Akses bisnis ini sedang ditangguhkan'),
    ).toBeInTheDocument();
  });

  it('logs out and returns to the login screen', async () => {
    render(<SuspendedTenantDialog />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    });
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('keeps the reader on screen when logging out fails', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    render(<SuspendedTenantDialog />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Belum berhasil keluar',
      );
    });
    expect(push).not.toHaveBeenCalled();
  });
});
