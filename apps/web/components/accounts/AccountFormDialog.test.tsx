import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { AccountResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { AccountFormDialog } from './AccountFormDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

const mockAccount: AccountResponse = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'QRIS BCA',
  type: 'EWALLET',
  openingBalance: '0.00',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('AccountFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode and creates account on submit', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockAccount);
    const onOpenChange = vi.fn();

    renderWithClient(
      <AccountFormDialog open={true} onOpenChange={onOpenChange} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Tambah Metode Pembayaran' }),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText(/nama akun \/ metode/i), {
      target: { value: 'QRIS Gopay' },
    });

    const submitBtn = screen.getByRole('button', {
      name: /tambah metode/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/accounts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'QRIS Gopay',
            type: 'CASH',
            openingBalance: '0',
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders edit mode with prefilled values and updates account on submit', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      ...mockAccount,
      name: 'QRIS ShopeePay',
    });
    const onOpenChange = vi.fn();

    renderWithClient(
      <AccountFormDialog
        open={true}
        onOpenChange={onOpenChange}
        account={mockAccount}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Edit Metode Pembayaran' }),
    ).toBeDefined();
    expect(screen.getByLabelText(/nama akun \/ metode/i)).toHaveValue(
      mockAccount.name,
    );

    fireEvent.change(screen.getByLabelText(/nama akun \/ metode/i), {
      target: { value: 'QRIS ShopeePay' },
    });

    const submitBtn = screen.getByRole('button', { name: /simpan perubahan/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/accounts/${mockAccount.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            name: 'QRIS ShopeePay',
            type: mockAccount.type,
            openingBalance: mockAccount.openingBalance,
          }),
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
