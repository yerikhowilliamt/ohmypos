import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { BranchResponse, DeviceResponse } from '@ohmypos/api-contracts';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deactivateMutate = vi.fn();
const deleteMutate = vi.fn();
const devices = vi.fn();

vi.mock('@/hooks/useDevices', () => ({
  useDevices: () => devices(),
  useCreateDevice: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateDevice: () => ({ mutateAsync: updateMutate, isPending: false }),
  useDeactivateDevice: () => ({ mutate: deactivateMutate, isPending: false }),
  useDeleteDevice: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

const BRANCH_A: BranchResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cabang Tebet',
  address: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};
const BRANCH_B: BranchResponse = {
  ...BRANCH_A,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Cabang Menteng',
};

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ data: [BRANCH_A, BRANCH_B] }),
}));

import { DevicesClient } from './DevicesClient';

const ACTIVE: DeviceResponse = {
  id: '33333333-3333-4333-8333-333333333333',
  branchId: BRANCH_A.id,
  label: 'Tablet Kasir 1',
  isActive: true,
  activatedByUserId: null,
  activatedAt: '2026-08-02T00:00:00.000Z',
  activationCode: null,
  activationCodeExpiresAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
};
const PENDING: DeviceResponse = {
  ...ACTIVE,
  id: '44444444-4444-4444-8444-444444444444',
  label: 'Tablet Kasir 2',
  isActive: false,
  activatedAt: null,
  activationCode: 'abc123',
};

beforeEach(() => {
  vi.clearAllMocks();
  devices.mockReturnValue({ data: [ACTIVE, PENDING], isLoading: false });
});

describe('DevicesClient actions', () => {
  it('offers edit and delete on every device, including one awaiting activation', () => {
    render(<DevicesClient />);

    // The pending device previously had NO action at all — and it is the one
    // most likely to have been created by mistake.
    expect(screen.getByText('Edit Tablet Kasir 2')).toBeInTheDocument();
    expect(screen.getByText('Hapus Tablet Kasir 2')).toBeInTheDocument();
    // Deactivate stays exclusive to an active device.
    expect(screen.getByText('Nonaktifkan Tablet Kasir 1')).toBeInTheDocument();
    expect(
      screen.queryByText('Nonaktifkan Tablet Kasir 2'),
    ).not.toBeInTheDocument();
  });

  it('opens the edit dialog prefilled and PATCHes the device', async () => {
    updateMutate.mockResolvedValue(ACTIVE);
    render(<DevicesClient />);

    fireEvent.click(screen.getByText('Edit Tablet Kasir 1').closest('button')!);

    expect(await screen.findByText('Edit Perangkat')).toBeInTheDocument();
    const label = screen.getByLabelText('Label');
    expect(label).toHaveValue('Tablet Kasir 1');

    fireEvent.change(label, { target: { value: 'Tablet Kasir Depan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate).toHaveBeenCalledWith({
      id: ACTIVE.id,
      data: { branchId: BRANCH_A.id, label: 'Tablet Kasir Depan' },
    });
  });

  it('locks the branch picker while the device is active', async () => {
    render(<DevicesClient />);
    fireEvent.click(screen.getByText('Edit Tablet Kasir 1').closest('button')!);

    await screen.findByText('Edit Perangkat');
    // Moving a live terminal would change who may log in from it without the
    // physical re-activation ceremony (ADR-021), so the API refuses it.
    expect(screen.getByLabelText('Cabang')).toBeDisabled();
    expect(
      screen.getByText(/Nonaktifkan perangkat dulu untuk memindahkannya/i),
    ).toBeInTheDocument();
  });

  it('leaves the branch picker editable on a device awaiting activation', async () => {
    render(<DevicesClient />);
    fireEvent.click(screen.getByText('Edit Tablet Kasir 2').closest('button')!);

    await screen.findByText('Edit Perangkat');
    expect(screen.getByLabelText('Cabang')).not.toBeDisabled();
  });

  it('deletes a device through the confirmation dialog', async () => {
    deleteMutate.mockResolvedValue(PENDING);
    render(<DevicesClient />);

    fireEvent.click(
      screen.getByText('Hapus Tablet Kasir 2').closest('button')!,
    );
    expect(await screen.findByText('Hapus Perangkat')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith(PENDING.id));
  });

  it("surfaces the server's refusal verbatim and keeps the device listed", async () => {
    // The API refuses a device that already has logins; its message is the one
    // that tells the Owner to deactivate instead, so it must not be swallowed.
    const message =
      'Cannot delete a device with 42 attendance record(s) — deactivate it instead, so its past logins keep showing the terminal they came from';
    deleteMutate.mockRejectedValue(new Error(message));
    render(<DevicesClient />);

    fireEvent.click(
      screen.getByText('Hapus Tablet Kasir 1').closest('button')!,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Tablet Kasir 1')).toBeInTheDocument();
  });
});
