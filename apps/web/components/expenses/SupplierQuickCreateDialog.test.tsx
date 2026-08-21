import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { SupplierResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { SupplierQuickCreateDialog } from './SupplierQuickCreateDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

const mockSupplier: SupplierResponse = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  name: 'CV Sumber Rasa',
  contact: '0812-3456-7890',
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

describe('SupplierQuickCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a supplier and hands it back via onCreated', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockSupplier);
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();

    renderWithClient(
      <SupplierQuickCreateDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nama pemasok/i), {
      target: { value: 'CV Sumber Rasa' },
    });
    fireEvent.change(screen.getByLabelText(/kontak/i), {
      target: { value: '0812-3456-7890' },
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah pemasok/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/suppliers',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'CV Sumber Rasa',
            contact: '0812-3456-7890',
          }),
        }),
      );
    });

    expect(onCreated).toHaveBeenCalledWith(mockSupplier);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a validation error when the name is empty', async () => {
    renderWithClient(
      <SupplierQuickCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /tambah pemasok/i }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces the server error without closing the dialog', async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(
      new Error('Nama pemasok sudah digunakan'),
    );
    const onOpenChange = vi.fn();

    renderWithClient(
      <SupplierQuickCreateDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nama pemasok/i), {
      target: { value: 'CV Sumber Rasa' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tambah pemasok/i }));

    expect(
      await screen.findByText('Nama pemasok sudah digunakan'),
    ).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
