import * as React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ImpersonationBanner } from './ImpersonationBanner';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

/**
 * ADR-025 Decision 8. Two things are worth locking down here: that the banner
 * names the tenant (a banner that says only "impersonating" is the one an
 * operator stops seeing), and that leaving actually clears the credential
 * rather than just navigating away from it.
 */
describe('ImpersonationBanner', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the tenant and says the session is read-only', () => {
    render(<ImpersonationBanner label="Kopi Melati" />);
    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
    expect(screen.getByText('Kopi Melati')).toBeInTheDocument();
    expect(
      screen.getByText(/Hanya bisa membaca; semua perubahan ditolak/),
    ).toBeInTheDocument();
  });

  it('has no dismiss control — only an exit', () => {
    // Deliberate: a dismissable banner is the one that gets dismissed in the
    // first minute, and then the operator forgets whose numbers they are
    // reading.
    render(<ImpersonationBanner label="Kopi Melati" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Keluar dari mode ini');
  });

  it('clears the cookies and returns to the console', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<ImpersonationBanner label="Kopi Melati" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/platform/impersonation', {
        method: 'DELETE',
      });
    });
    expect(push).toHaveBeenCalledWith('/platform');
  });

  it('still returns to the console when clearing fails', async () => {
    // Leaving the operator inside a tenant believing they left is the worse of
    // the two outcomes, so the redirect is in a `finally`.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<ImpersonationBanner label="Kopi Melati" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/platform');
    });
  });
});
