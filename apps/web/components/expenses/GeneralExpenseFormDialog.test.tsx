import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  AccountResponse,
  BranchResponse,
  CategoryResponse,
  LedgerEntryResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { GeneralExpenseFormDialog } from './GeneralExpenseFormDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const mockCategories: CategoryResponse[] = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    name: 'Sewa',
    type: 'OUTFLOW',
    isSystem: false,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-1111-4111-8111-111111111111',
    name: 'Penjualan',
    type: 'INFLOW',
    isSystem: true,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockAccounts: AccountResponse[] = [
  {
    id: 'cccccccc-1111-4111-8111-111111111111',
    name: 'Kas Tunai',
    type: 'CASH',
    openingBalance: '0.00',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockBranches: BranchResponse[] = [
  {
    id: 'ffffffff-1111-4111-8111-111111111111',
    name: 'Umum',
    address: null,
    isSystem: true,
    isMainStore: false,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: 'eeeeeeee-2222-4222-8222-222222222222',
    name: 'Cabang Kenanga',
    address: null,
    isSystem: false,
    isMainStore: false,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: 'dddddddd-1111-4111-8111-111111111111',
    name: 'Cabang Melati',
    address: null,
    isSystem: false,
    isMainStore: true,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockCreatedEntry: LedgerEntryResponse = {
  id: 'eeeeeeee-1111-4111-8111-111111111111',
  accountId: mockAccounts[0].id,
  categoryId: mockCategories[0].id,
  branchId: mockBranches[2].id,
  entryDate: '2026-08-17',
  amount: '500000.00',
  type: 'OUTFLOW',
  sourceType: 'MANUAL',
  sourceId: null,
  note: 'Sewa toko',
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

function mockReferenceData() {
  vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
    if (path === '/categories') return Promise.resolve(mockCategories);
    if (path === '/accounts') return Promise.resolve(mockAccounts);
    if (path === '/branches') return Promise.resolve(mockBranches);
    return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
  });
}

describe('GeneralExpenseFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only offers OUTFLOW categories in the picker', async () => {
    mockReferenceData();

    renderWithClient(
      <GeneralExpenseFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    const categorySelect = await screen.findByLabelText(/kategori/i);
    expect(await screen.findByText('Sewa')).toBeDefined();
    expect(screen.queryByText('Penjualan')).toBeNull();
    expect(categorySelect).toBeDefined();
  });

  it('submits a CreateLedgerEntry-shaped body with type OUTFLOW', async () => {
    mockReferenceData();
    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path === '/categories') return Promise.resolve(mockCategories);
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/branches') return Promise.resolve(mockBranches);
      if (path === '/ledger-entries') return Promise.resolve(mockCreatedEntry);
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    });

    const onOpenChange = vi.fn();
    renderWithClient(
      <GeneralExpenseFormDialog open={true} onOpenChange={onOpenChange} />,
    );

    await screen.findByText('Sewa');

    const categoryTrigger = screen.getByLabelText(/kategori/i);
    fireEvent.click(categoryTrigger);
    const categoryOption = await screen.findByRole('option', { name: 'Sewa' });
    fireEvent.click(categoryOption);

    const accountTrigger = screen.getByLabelText(/akun \/ kas/i);
    fireEvent.click(accountTrigger);
    const accountOption = await screen.findByRole('option', {
      name: 'Kas Tunai',
    });
    fireEvent.click(accountOption);

    const branchTrigger = screen.getByLabelText('Pilih Cabang');
    fireEvent.click(branchTrigger);
    const branchOption = await screen.findByRole('option', {
      name: 'Cabang Melati',
    });
    fireEvent.click(branchOption);

    fireEvent.change(screen.getByLabelText(/jumlah/i), {
      target: { value: '500000' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /simpan pengeluaran/i }),
    );

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/ledger-entries',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const postCall = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.find((call) => call[0] === '/ledger-entries');
    expect(postCall).toBeDefined();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload).toEqual({
      accountId: mockAccounts[0].id,
      categoryId: mockCategories[0].id,
      branchId: mockBranches[2].id,
      entryDate: expect.any(String),
      amount: '500000',
      type: 'OUTFLOW',
      note: '',
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits null for a central expense and excludes the system branch from the branch picker', async () => {
    mockReferenceData();
    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path === '/categories') return Promise.resolve(mockCategories);
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/branches') return Promise.resolve(mockBranches);
      if (path === '/ledger-entries') return Promise.resolve(mockCreatedEntry);
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    });

    renderWithClient(
      <GeneralExpenseFormDialog open={true} onOpenChange={vi.fn()} />,
    );
    await screen.findByText('Sewa');

    fireEvent.click(screen.getByLabelText(/kategori/i));
    fireEvent.click(await screen.findByRole('option', { name: 'Sewa' }));
    fireEvent.click(screen.getByLabelText(/akun \/ kas/i));
    fireEvent.click(await screen.findByRole('option', { name: 'Kas Tunai' }));
    fireEvent.click(screen.getByLabelText('Umum'));
    fireEvent.change(screen.getByLabelText(/jumlah/i), {
      target: { value: '500000' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /simpan pengeluaran/i }),
    );

    await waitFor(() => {
      const postCall = vi
        .mocked(apiModule.apiFetch)
        .mock.calls.find((call) => call[0] === '/ledger-entries');
      const payload = JSON.parse(String(postCall?.[1]?.body));
      expect(payload.branchId).toBeNull();
    });

    fireEvent.click(screen.getByLabelText('Cabang'));
    fireEvent.click(screen.getByLabelText('Pilih Cabang'));
    expect(screen.queryByRole('option', { name: 'Umum' })).toBeNull();
  });

  it('can move an existing manual expense from a branch to the center', async () => {
    mockReferenceData();
    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path === '/categories') return Promise.resolve(mockCategories);
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/branches') return Promise.resolve(mockBranches);
      if (path === `/ledger-entries/${mockCreatedEntry.id}`) {
        return Promise.resolve({
          ...mockCreatedEntry,
          branchId: mockBranches[0].id,
        });
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    });

    renderWithClient(
      <GeneralExpenseFormDialog
        open={true}
        onOpenChange={vi.fn()}
        entry={mockCreatedEntry}
      />,
    );
    await screen.findByRole('heading', { name: 'Edit Biaya Operasional' });

    fireEvent.click(screen.getByLabelText('Umum'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/ledger-entries/${mockCreatedEntry.id}`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    const patchCall = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.find(
        (call) => call[0] === `/ledger-entries/${mockCreatedEntry.id}`,
      );
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload.branchId).toBeNull();
  });

  it('restores the previous branch after switching to the center and back', async () => {
    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path === '/categories') return Promise.resolve(mockCategories);
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/branches') return Promise.resolve(mockBranches);
      if (path === `/ledger-entries/${mockCreatedEntry.id}`) {
        return Promise.resolve(mockCreatedEntry);
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    });

    renderWithClient(
      <GeneralExpenseFormDialog
        open={true}
        onOpenChange={vi.fn()}
        entry={mockCreatedEntry}
      />,
    );
    await screen.findByRole('heading', { name: 'Edit Biaya Operasional' });

    fireEvent.click(screen.getByLabelText('Umum'));
    expect(screen.queryByLabelText('Pilih Cabang')).toBeNull();

    fireEvent.click(screen.getByLabelText('Cabang'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => {
      const patchCall = vi
        .mocked(apiModule.apiFetch)
        .mock.calls.find(
          (call) => call[0] === `/ledger-entries/${mockCreatedEntry.id}`,
        );
      const payload = JSON.parse(String(patchCall?.[1]?.body));
      expect(payload.branchId).toBe(mockBranches[2].id);
    });
  });

  it('shows a validation error when required fields are missing', async () => {
    mockReferenceData();

    renderWithClient(
      <GeneralExpenseFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    await screen.findByText('Sewa');

    fireEvent.click(
      screen.getByRole('button', { name: /simpan pengeluaran/i }),
    );

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/ledger-entries',
      expect.anything(),
    );
  });
});
