import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  AccountResponse,
  PayableResponse,
  PayableSettlementResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PayableSettlementDialog } from './PayableSettlementDialog';
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

const mockPayable: PayableResponse = {
  id: '11111111-2222-4333-8444-555555555555',
  supplierPurchaseId: '22222222-3333-4444-8555-666666666666',
  supplierId: '33333333-4444-4555-8666-777777777777',
  supplierName: 'CV Sumber Rasa',
  originalAmount: '500000.00',
  remainingBalance: '500000.00',
  settledAmount: '0.00',
  status: 'OPEN',
  settlements: [],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

const mockSettlementResponse: PayableSettlementResponse = {
  id: '44444444-5555-4666-8777-888888888888',
  payableId: mockPayable.id,
  accountId: mockAccounts[0].id,
  ledgerEntryId: '55555555-6666-4777-8888-999999999999',
  amount: '500000.00',
  settledAt: '2026-08-17',
  note: null,
  createdAt: '2026-08-17T00:00:00.000Z',
};

function mockReferenceData() {
  vi.mocked(apiModule.apiFetch).mockImplementation(
    (path: string, init?: RequestInit) => {
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (
        path === `/payables/${mockPayable.id}/settlements` &&
        init?.method === 'POST'
      ) {
        return Promise.resolve(mockSettlementResponse);
      }
      return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
    },
  );
}

describe('PayableSettlementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a full settlement and closes dialog', async () => {
    mockReferenceData();
    const onOpenChange = vi.fn();

    renderWithClient(
      <PayableSettlementDialog
        open={true}
        onOpenChange={onOpenChange}
        payable={mockPayable}
      />,
    );

    // Wait for accounts reference data to load
    await screen.findByText('Kas Tunai');

    // Select account
    fireEvent.change(screen.getByLabelText(/dibayar dari akun/i), {
      target: { value: mockAccounts[0].id },
    });

    // Enter full settlement amount
    fireEvent.change(screen.getByTestId('settlement-amount-input'), {
      target: { value: '500000' },
    });

    // Remaining after should be 0
    await waitFor(() => {
      expect(screen.getByTestId('remaining-after-payment')).toHaveTextContent(
        /Rp\s*0/,
      );
    });

    const submitBtn = screen.getByRole('button', { name: /^bayar utang$/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/payables/${mockPayable.id}/settlements`,
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const postCall = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.find(
        (call) => call[0] === `/payables/${mockPayable.id}/settlements`,
      );
    expect(postCall).toBeDefined();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload).toEqual({
      accountId: mockAccounts[0].id,
      amount: '500000',
      settledAt: expect.any(String),
      note: '',
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits a partial settlement and displays updated remaining balance', async () => {
    mockReferenceData();
    const onOpenChange = vi.fn();

    renderWithClient(
      <PayableSettlementDialog
        open={true}
        onOpenChange={onOpenChange}
        payable={mockPayable}
      />,
    );

    // Wait for accounts reference data to load
    await screen.findByText('Kas Tunai');

    fireEvent.change(screen.getByLabelText(/dibayar dari akun/i), {
      target: { value: mockAccounts[0].id },
    });

    // Enter partial amount: 200.000 out of 500.000
    fireEvent.change(screen.getByTestId('settlement-amount-input'), {
      target: { value: '200000' },
    });

    // Remaining balance after payment: 300.000
    await waitFor(() => {
      expect(screen.getByTestId('remaining-after-payment')).toHaveTextContent(
        /Rp\s*300\.000/,
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /^bayar utang$/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/payables/${mockPayable.id}/settlements`,
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const postCall = vi
      .mocked(apiModule.apiFetch)
      .mock.calls.find(
        (call) => call[0] === `/payables/${mockPayable.id}/settlements`,
      );
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.amount).toBe('200000');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks submit client-side when amount exceeds remaining balance', async () => {
    mockReferenceData();

    renderWithClient(
      <PayableSettlementDialog
        open={true}
        onOpenChange={vi.fn()}
        payable={mockPayable}
      />,
    );

    // Wait for accounts reference data to load
    await screen.findByText('Kas Tunai');

    fireEvent.change(screen.getByLabelText(/dibayar dari akun/i), {
      target: { value: mockAccounts[0].id },
    });

    // Enter over-settlement amount: 600.000 > 500.000
    fireEvent.change(screen.getByTestId('settlement-amount-input'), {
      target: { value: '600000' },
    });

    // Warning alert is displayed
    expect(await screen.findByTestId('overage-warning')).toBeDefined();
    expect(screen.getByText(/jumlah bayar melebihi sisa utang/i)).toBeDefined();

    // Submit button is disabled
    const submitBtn = screen.getByRole('button', { name: /^bayar utang$/i });
    expect(submitBtn).toBeDisabled();

    // Attempting submit does not trigger apiFetch
    fireEvent.click(submitBtn);
    expect(apiModule.apiFetch).not.toHaveBeenCalledWith(
      `/payables/${mockPayable.id}/settlements`,
      expect.anything(),
    );
  });

  it('surfaces server error when settlement creation fails', async () => {
    vi.mocked(apiModule.apiFetch).mockImplementation(
      (path: string, init?: RequestInit) => {
        if (path === '/accounts') return Promise.resolve(mockAccounts);
        if (
          path === `/payables/${mockPayable.id}/settlements` &&
          init?.method === 'POST'
        ) {
          return Promise.reject(new Error('Saldo akun tidak mencukupi'));
        }
        return Promise.reject(new Error(`Unexpected apiFetch call: ${path}`));
      },
    );

    const onOpenChange = vi.fn();

    renderWithClient(
      <PayableSettlementDialog
        open={true}
        onOpenChange={onOpenChange}
        payable={mockPayable}
      />,
    );

    // Wait for accounts reference data to load
    await screen.findByText('Kas Tunai');

    fireEvent.change(screen.getByLabelText(/dibayar dari akun/i), {
      target: { value: mockAccounts[0].id },
    });
    fireEvent.change(screen.getByTestId('settlement-amount-input'), {
      target: { value: '500000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^bayar utang$/i }));

    expect(await screen.findByText('Saldo akun tidak mencukupi')).toBeDefined();
    // Dialog should not close on error
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('closes dialog when Batal button is clicked', async () => {
    mockReferenceData();
    const onOpenChange = vi.fn();

    renderWithClient(
      <PayableSettlementDialog
        open={true}
        onOpenChange={onOpenChange}
        payable={mockPayable}
      />,
    );

    await screen.findByText('Kas Tunai');

    fireEvent.click(screen.getByRole('button', { name: /batal/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
