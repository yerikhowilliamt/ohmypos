import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  BranchResponse,
  PaymentMethodResponse,
  ProductWithHppResponse,
  SaleResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PosScreen } from './PosScreen';
import * as apiModule from '@/lib/api';

/**
 * OWNER-only branch picker (PosScreen.tsx). Kept as a separate file so
 * PosScreen.test.tsx — which only ever exercises `role="KASIR"` — stays
 * byte-identical, per the pattern every prior UI-revamp phase followed.
 */

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('@/lib/api');
  return {
    ...actual,
    apiFetch: vi.fn(),
    API_BASE_URL: 'http://localhost:4013/api/v1',
  };
});

const MELATI = 'bbbbbbbb-1111-4111-8111-111111111111';
const KENANGA = 'bbbbbbbb-2222-4222-8222-222222222222';
const PUSAT = 'bbbbbbbb-3333-4333-8333-333333333333';
const ACCOUNT_CASH = 'cccccccc-1111-4111-8111-111111111111';
const KOPI_SUSU = 'dddddddd-1111-4111-8111-111111111111';

const branches: BranchResponse[] = [
  {
    id: MELATI,
    name: 'Cabang Melati',
    address: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: KENANGA,
    name: 'Cabang Kenanga',
    address: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
  // ADR-014/015: must never appear as a pickable option — the backend
  // rejects any Sale created against it.
  {
    id: PUSAT,
    name: 'Pusat (Dapur Sentral)',
    address: 'Dapur Sentral',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
];

const products: ProductWithHppResponse[] = [
  {
    id: KOPI_SUSU,
    name: 'Es Kopi Susu',
    sellPrice: '20000.00',
    isActive: true,
    hpp: '0.00',
    // `canAddProduct` (lib/pos/availability.ts) refuses any product with
    // `hasRecipe: false` — `hppAtSale` would have to be null (ADR-015) — so
    // the fixture needs a (trivial, ingredient-free) recipe to be addable.
    hasRecipe: true,
    margin: '20000.00',
    makeableQuantity: null,
    recipeItems: [],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
];

const paymentMethods: PaymentMethodResponse[] = [
  { id: ACCOUNT_CASH, name: 'Kas Tunai', type: 'CASH' },
];

function saleResponseFor(branchId: string, branchName: string): SaleResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    branchId,
    branchName,
    accountId: ACCOUNT_CASH,
    accountName: 'Kas Tunai',
    userId: '22222222-2222-4222-8222-222222222222',
    cashierName: 'Owner Satu',
    ledgerEntryId: '33333333-3333-4333-8333-333333333333',
    totalAmount: '20000.00',
    totalHpp: '0.00',
    grossMargin: '20000.00',
    soldAt: '2026-08-17T03:00:00.000Z',
    items: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        productId: KOPI_SUSU,
        productName: 'Es Kopi Susu',
        quantity: '1.0000',
        unitPriceAtSale: '20000.00',
        isPriceOverridden: false,
        hppAtSale: '0.00',
        lineTotal: '20000.00',
      },
    ],
    createdAt: '2026-08-17T03:00:00.000Z',
    updatedAt: '2026-08-17T03:00:00.000Z',
  };
}

/** Routes each GET to its fixture; the POST is left to the individual test. */
function mockReads(onPost?: (body: unknown) => Promise<unknown>) {
  vi.mocked(apiModule.apiFetch).mockImplementation(
    (path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path === '/sales') {
        const body = init.body ? JSON.parse(init.body as string) : undefined;
        return (onPost?.(body) ??
          Promise.resolve(
            saleResponseFor(MELATI, 'Cabang Melati'),
          )) as Promise<never>;
      }
      if (path === '/products')
        return Promise.resolve(products) as Promise<never>;
      if (path === '/raw-materials')
        return Promise.resolve([]) as Promise<never>;
      if (path === '/accounts/payment-methods')
        return Promise.resolve(paymentMethods) as Promise<never>;
      if (path === '/branches')
        return Promise.resolve(branches) as Promise<never>;
      if (path.startsWith('/sales?'))
        return Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }) as Promise<never>;
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
  );
}

/** The single POST call recorded on the mock, for asserting the request body. */
function postCalls() {
  return vi
    .mocked(apiModule.apiFetch)
    .mock.calls.filter(
      ([path, init]) => path === '/sales' && init?.method === 'POST',
    );
}

async function pickBranch(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Cabang' }));
  fireEvent.click(await screen.findByText(name));
  // Radix Select sets `pointer-events: none` on <body> while its portal is
  // open and clears it asynchronously on close — without waiting for that,
  // a click fired immediately after selecting an item can land while the
  // body still blocks pointer events, silently swallowing it.
  await waitFor(() =>
    expect(document.body.style.pointerEvents).not.toBe('none'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () =>
      `00000000-0000-4000-8000-00000000000${(counter += 1)}` as `${string}-${string}-${string}-${string}-${string}`,
  );
});

describe('PosScreen — OWNER branch picker', () => {
  it('shows the branch picker and a placeholder, not the grid, until a branch is picked', async () => {
    mockReads();
    renderWithClient(<PosScreen branchId={null} role="OWNER" />);

    expect(
      await screen.findByRole('combobox', { name: 'Cabang' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pilih cabang untuk memulai transaksi.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`product-card-${KOPI_SUSU}`),
    ).not.toBeInTheDocument();
  });

  it('excludes the central branch from the picker options', async () => {
    mockReads();
    renderWithClient(<PosScreen branchId={null} role="OWNER" />);

    fireEvent.click(await screen.findByRole('combobox', { name: 'Cabang' }));
    expect(await screen.findByText('Cabang Melati')).toBeInTheDocument();
    expect(screen.getByText('Cabang Kenanga')).toBeInTheDocument();
    expect(screen.queryByText('Pusat (Dapur Sentral)')).not.toBeInTheDocument();
  });

  it('reveals the grid/cart after picking a branch and submits with that branchId', async () => {
    mockReads();
    renderWithClient(<PosScreen branchId={null} role="OWNER" />);

    await pickBranch('Cabang Melati');
    await screen.findByTestId(`product-card-${KOPI_SUSU}`);

    fireEvent.click(screen.getByTestId(`product-card-${KOPI_SUSU}`));
    fireEvent.click(
      await screen.findByTestId(`payment-method-${ACCOUNT_CASH}`),
    );
    fireEvent.click(screen.getByTestId('cart-submit'));

    await screen.findByText('Penjualan tercatat');

    const calls = postCalls();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.branchId).toBe(MELATI);
  });

  it('keeps cart lines when switching branch mid-cart and submits with the new branchId', async () => {
    mockReads();
    renderWithClient(<PosScreen branchId={null} role="OWNER" />);

    await pickBranch('Cabang Melati');
    await screen.findByTestId(`product-card-${KOPI_SUSU}`);
    fireEvent.click(screen.getByTestId(`product-card-${KOPI_SUSU}`));
    expect(screen.getByTestId('cart-total')).toHaveTextContent('20.000');

    await pickBranch('Cabang Kenanga');
    // The line survives the branch switch — branchId is attribution-only
    // (ADR-004), so it never affects stock/cart state.
    expect(screen.getByTestId('cart-total')).toHaveTextContent('20.000');

    fireEvent.click(
      await screen.findByTestId(`payment-method-${ACCOUNT_CASH}`),
    );
    fireEvent.click(screen.getByTestId('cart-submit'));

    await screen.findByText('Penjualan tercatat');
    const calls = postCalls();
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.branchId).toBe(KENANGA);
  });

  it('never renders the branch picker for KASIR', async () => {
    mockReads();
    renderWithClient(<PosScreen branchId={MELATI} role="KASIR" />);

    await screen.findByTestId(`product-card-${KOPI_SUSU}`);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Pilih cabang untuk memulai transaksi.'),
    ).not.toBeInTheDocument();
  });
});
