import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  AccountResponse,
  BranchResponse,
  RawMaterialResponse,
  SupplierPurchaseResponse,
  SupplierResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PurchaseEntryFormDialog } from './PurchaseEntryFormDialog';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const mockSuppliers: SupplierResponse[] = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    name: 'CV Sumber Rasa',
    contact: null,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockBranches: BranchResponse[] = [
  {
    id: 'bbbbbbbb-1111-4111-8111-111111111111',
    name: 'Cabang Melati',
    address: null,
    isSystem: false,
    isMainStore: true,
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

const mockRawMaterials: RawMaterialResponse[] = [
  {
    id: 'dddddddd-1111-4111-8111-111111111111',
    name: 'Biji Kopi Espresso',
    unit: 'kg',
    purchaseUnit: 'kg',
    conversionFactor: '1.0000',
    isBaseUnitLocked: false,
    unitCost: '150000.00',
    currentStock: '5.0000',
    lowStockThreshold: '1.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
  {
    // ADR-024 fixture: bought per liter, stocked per ml — the handoff's own
    // worked example, so the preview assertion below is hand-checkable.
    id: 'eeeeeeee-2222-4222-8222-222222222222',
    name: 'Susu UHT Fresh',
    unit: 'ml',
    purchaseUnit: 'liter',
    conversionFactor: '1000.0000',
    isBaseUnitLocked: false,
    unitCost: '20.000000',
    currentStock: '10000.0000',
    lowStockThreshold: '2.0000',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

const mockUnpaidPurchase: SupplierPurchaseResponse = {
  id: 'ffffffff-1111-4111-8111-111111111111',
  supplierId: mockSuppliers[0].id,
  supplierName: mockSuppliers[0].name,
  branchId: null,
  isCentral: true,
  purchaseDate: '2026-08-17',
  paymentStatus: 'UNPAID',
  totalAmount: '1500000.00',
  ledgerEntryId: null,
  payableId: 'gggggggg-1111-4111-8111-111111111111',
  note: null,
  items: [],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

function mockReferenceData(onPost?: (body: unknown) => unknown) {
  vi.mocked(apiModule.apiFetch).mockImplementation(
    (path: string, init?: RequestInit) => {
      if (path.startsWith('/suppliers'))
        return Promise.resolve({
          data: mockSuppliers,
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        });
      if (path === '/branches') return Promise.resolve(mockBranches);
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/raw-materials') return Promise.resolve(mockRawMaterials);
      if (path === '/supplier-purchases' && init?.method === 'POST') {
        return Promise.resolve(
          onPost ? onPost(JSON.parse(String(init.body))) : mockUnpaidPurchase,
        );
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    },
  );
}

describe('PurchaseEntryFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the account picker for UNPAID and shows it for PAID', async () => {
    mockReferenceData();

    renderWithClient(
      <PurchaseEntryFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    await screen.findByText('CV Sumber Rasa');

    // UNPAID is the default — no account picker.
    expect(screen.queryByLabelText(/dibayar dari akun/i)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /lunas/i }));

    expect(await screen.findByLabelText(/dibayar dari akun/i)).toBeDefined();

    fireEvent.click(screen.getByRole('radio', { name: /^utang$/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/dibayar dari akun/i)).toBeNull();
    });
  });

  it('adds and removes item lines, updating the running total', async () => {
    mockReferenceData();

    renderWithClient(
      <PurchaseEntryFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    await screen.findByText('CV Sumber Rasa');

    fireEvent.click(
      screen.getByRole('button', { name: /tambah bahan pertama/i }),
    );
    expect(await screen.findByTestId('purchase-item-row-0')).toBeDefined();

    fireEvent.change(screen.getByTestId('purchase-raw-material-select-0'), {
      target: { value: mockRawMaterials[0].id },
    });
    fireEvent.change(screen.getByTestId('purchase-quantity-input-0'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByTestId('purchase-line-total-input-0'), {
      target: { value: '300000' },
    });

    // ADR-024: the user types the TOTAL, so the estimate is the sum of the
    // typed totals rather than a quantity × unit-price product.
    await waitFor(() => {
      expect(screen.getByTestId('purchase-running-total')).toHaveTextContent(
        /Rp\s*300\.000/,
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah bahan$/i }));
    expect(await screen.findByTestId('purchase-item-row-1')).toBeDefined();

    fireEvent.change(screen.getByTestId('purchase-raw-material-select-1'), {
      target: { value: mockRawMaterials[1].id },
    });
    fireEvent.change(screen.getByTestId('purchase-quantity-input-1'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('purchase-line-total-input-1'), {
      target: { value: '60000' },
    });

    // 300.000 + 60.000 = 360.000
    await waitFor(() => {
      expect(screen.getByTestId('purchase-running-total')).toHaveTextContent(
        /Rp\s*360\.000/,
      );
    });

    const removeButtons = screen.getAllByTitle('Hapus baris');
    fireEvent.click(removeButtons[1]);

    await waitFor(() => {
      expect(screen.queryByTestId('purchase-item-row-1')).toBeNull();
      expect(screen.getByTestId('purchase-running-total')).toHaveTextContent(
        /Rp\s*300\.000/,
      );
    });
  });

  it('rejects a duplicate raw material across two lines (client-side superRefine)', async () => {
    mockReferenceData();

    renderWithClient(
      <PurchaseEntryFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    await screen.findByText('CV Sumber Rasa');

    const supplierTrigger = screen.getByLabelText(/pemasok/i);
    fireEvent.click(supplierTrigger);
    const supplierOption = await screen.findByRole('option', {
      name: 'CV Sumber Rasa',
    });
    fireEvent.click(supplierOption);

    fireEvent.click(
      screen.getByRole('button', { name: /tambah bahan pertama/i }),
    );
    const rm0Trigger = screen.getByTestId('purchase-raw-material-select-0');
    fireEvent.click(rm0Trigger);
    const rm0Option = await screen.findByRole('option', {
      name: 'Biji Kopi Espresso (beli: kg)',
    });
    fireEvent.click(rm0Option);

    fireEvent.change(screen.getByTestId('purchase-quantity-input-0'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByTestId('purchase-line-total-input-0'), {
      target: { value: '1000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah bahan$/i }));
    const rm1Trigger = screen.getByTestId('purchase-raw-material-select-1');
    fireEvent.click(rm1Trigger);
    const rm1Option = await screen.findByRole('option', {
      name: 'Biji Kopi Espresso (beli: kg)',
    });
    fireEvent.click(rm1Option);

    fireEvent.change(screen.getByTestId('purchase-quantity-input-1'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByTestId('purchase-line-total-input-1'), {
      target: { value: '1000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /simpan pembelian/i }));

    expect(await screen.findByText(/tercantum dua kali/i)).toBeDefined();
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      '/supplier-purchases',
      expect.anything(),
    );
  });

  it('fires onUnpaidPurchaseCreated after a successful UNPAID submit', async () => {
    mockReferenceData();
    const onUnpaidPurchaseCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(
      <PurchaseEntryFormDialog
        open={true}
        onOpenChange={onOpenChange}
        onUnpaidPurchaseCreated={onUnpaidPurchaseCreated}
      />,
    );

    await screen.findByText('CV Sumber Rasa');

    const supplierTrigger = screen.getByLabelText(/pemasok/i);
    fireEvent.click(supplierTrigger);
    const supplierOption = await screen.findByRole('option', {
      name: 'CV Sumber Rasa',
    });
    fireEvent.click(supplierOption);

    fireEvent.click(
      screen.getByRole('button', { name: /tambah bahan pertama/i }),
    );
    const rm0Trigger = screen.getByTestId('purchase-raw-material-select-0');
    fireEvent.click(rm0Trigger);
    const rm0Option = await screen.findByRole('option', {
      name: 'Biji Kopi Espresso (beli: kg)',
    });
    fireEvent.click(rm0Option);

    fireEvent.change(screen.getByTestId('purchase-quantity-input-0'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByTestId('purchase-line-total-input-0'), {
      target: { value: '150000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /simpan pembelian/i }));

    await waitFor(() => {
      expect(onUnpaidPurchaseCreated).toHaveBeenCalledWith(
        mockSuppliers[0].name,
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('previews the unit conversion and derived cost before submit', async () => {
    // "2 liter for Rp45.000" must visibly become "2.000 ml at Rp22,50/ml"
    // BEFORE the user submits — the derived cost is what will be stored, so it
    // must not be a surprise afterwards (ADR-024).
    mockReferenceData();

    renderWithClient(
      <PurchaseEntryFormDialog open={true} onOpenChange={vi.fn()} />,
    );

    await screen.findByText('CV Sumber Rasa');
    fireEvent.click(
      screen.getByRole('button', { name: /tambah bahan pertama/i }),
    );

    const trigger = screen.getByTestId('purchase-raw-material-select-0');
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole('option', {
        name: 'Susu UHT Fresh (beli: liter)',
      }),
    );

    fireEvent.change(screen.getByTestId('purchase-quantity-input-0'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByTestId('purchase-line-total-input-0'), {
      target: { value: '45000' },
    });

    await waitFor(() => {
      const preview = screen.getByTestId('purchase-conversion-preview-0');
      expect(preview).toHaveTextContent('2 liter = 2.000 ml');
      expect(preview).toHaveTextContent('/ml');
      expect(preview).toHaveTextContent('Stok +2.000 ml');
    });
  });
});
