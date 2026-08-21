import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type {
  AccountResponse,
  PayableResponse,
  PayableSupplierSummary,
  PaginationMeta,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PayablesTab } from './PayablesTab';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

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

const mockPayables: {
  data: PayableResponse[];
  meta: PaginationMeta;
} = {
  data: [
    {
      id: '11111111-2222-4333-8444-555555555555',
      supplierPurchaseId: '22222222-3333-4444-8555-666666666666',
      supplierId: '33333333-4444-4555-8666-777777777777',
      supplierName: 'CV Sumber Rasa',
      originalAmount: '500000.00',
      remainingBalance: '300000.00',
      settledAmount: '200000.00',
      status: 'PARTIALLY_SETTLED',
      settlements: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
    {
      id: '99999999-2222-4333-8444-555555555555',
      supplierPurchaseId: '88888888-3333-4444-8555-666666666666',
      supplierId: '77777777-4444-4555-8666-777777777777',
      supplierName: 'PT Kopi Nusantara',
      originalAmount: '1000000.00',
      remainingBalance: '0.00',
      settledAmount: '1000000.00',
      status: 'SETTLED',
      settlements: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
  ],
  meta: {
    page: 1,
    limit: 50,
    total: 2,
    totalPages: 1,
  },
};

const mockSummary: PayableSupplierSummary[] = [
  {
    supplierId: '33333333-4444-4555-8666-777777777777',
    supplierName: 'CV Sumber Rasa',
    openPayableCount: 1,
    totalOutstanding: '300000.00',
  },
];

function mockReferenceData() {
  vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/payables/summary'))
      return Promise.resolve(mockSummary);
    if (path.startsWith('/payables')) return Promise.resolve(mockPayables);
    if (path === '/accounts') return Promise.resolve(mockAccounts);
    return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
  });
}

describe('PayablesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders summary cards and payables list with status badges', async () => {
    mockReferenceData();

    renderWithClient(<PayablesTab />);

    // Wait for payables and summary queries to load
    const supplierElements = await screen.findAllByText('CV Sumber Rasa');
    expect(supplierElements.length).toBeGreaterThan(0);

    // Check summary card total
    expect(screen.getByText('Total Utang Terbuka')).toBeDefined();
    expect(screen.getByText(/1 pemasok/i)).toBeDefined();

    // Check payables rows
    expect(screen.getByText('PT Kopi Nusantara')).toBeDefined();

    // Check status badges
    expect(screen.getByText('Sebagian')).toBeDefined();
    expect(screen.getByText('Lunas')).toBeDefined();

    // Check amounts rendered (using regex for whitespace flexibility)
    expect(screen.getAllByText(/300\.000/).length).toBeGreaterThan(0);
  });

  it('opens settlement dialog when clicking Bayar on unsettled payable', async () => {
    mockReferenceData();

    renderWithClient(<PayablesTab />);

    const supplierElements = await screen.findAllByText('CV Sumber Rasa');
    expect(supplierElements.length).toBeGreaterThan(0);

    const payButtons = screen.getAllByRole('button', { name: /^bayar$/i });
    expect(payButtons).toHaveLength(2);

    // First button (CV Sumber Rasa, PARTIALLY_SETTLED) is enabled
    expect(payButtons[0]).not.toBeDisabled();
    // Second button (PT Kopi Nusantara, SETTLED) is disabled
    expect(payButtons[1]).toBeDisabled();

    fireEvent.click(payButtons[0]);

    // Dialog opens with title and supplier name
    expect(
      await screen.findByRole('heading', { name: 'Bayar Utang' }),
    ).toBeDefined();
    expect(screen.getAllByText('CV Sumber Rasa').length).toBeGreaterThan(0);
  });
});
