import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  PaymentMethodResponse,
  ProductWithHppResponse,
  RawMaterialResponse,
  SaleResponse,
} from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { PosScreen } from './PosScreen';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('@/lib/api');
  return {
    ...actual,
    apiFetch: vi.fn(),
    API_BASE_URL: 'http://localhost:4015/api/v1',
  };
});

const BRANCH_ID = 'bbbbbbbb-1111-4111-8111-111111111111';
const ACCOUNT_CASH = 'cccccccc-1111-4111-8111-111111111111';
const SUSU = 'aaaaaaaa-1111-4111-8111-111111111111';
const GULA = 'aaaaaaaa-2222-4222-8222-222222222222';
const KOPI_SUSU = 'dddddddd-1111-4111-8111-111111111111';
const LATTE = 'eeeeeeee-2222-4222-8222-222222222222';
const AIR = 'ffffffff-3333-4333-8333-333333333333';

const products: ProductWithHppResponse[] = [
  {
    id: KOPI_SUSU,
    name: 'Es Kopi Susu',
    sellPrice: '20000.00',
    isActive: true,
    hpp: '8000.00',
    hasRecipe: true,
    margin: '12000.00',
    makeableQuantity: 10,
    // 1 liter of Susu per cup.
    recipeItems: [{ rawMaterialId: SUSU, quantityUsed: '1.0000' }],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: LATTE,
    name: 'Latte',
    sellPrice: '25000.00',
    isActive: true,
    hpp: '9000.00',
    hasRecipe: true,
    margin: '16000.00',
    makeableQuantity: 5,
    // 2 liters of the SAME Susu — this is the contention pair.
    recipeItems: [
      { rawMaterialId: SUSU, quantityUsed: '2.0000' },
      { rawMaterialId: GULA, quantityUsed: '0.0100' },
    ],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: AIR,
    name: 'Air Mineral',
    sellPrice: '5000.00',
    isActive: true,
    hpp: null,
    hasRecipe: false,
    margin: null,
    makeableQuantity: null,
    recipeItems: [],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
];

const rawMaterials: RawMaterialResponse[] = [
  {
    id: SUSU,
    name: 'Susu UHT',
    unit: 'liter',
    unitCost: '20000.00',
    currentStock: '10.0000',
    lowStockThreshold: '2.0000',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: GULA,
    name: 'Gula Aren',
    unit: 'kg',
    unitCost: '35000.00',
    currentStock: '10.0000',
    lowStockThreshold: '1.0000',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
];

const paymentMethods: PaymentMethodResponse[] = [
  { id: ACCOUNT_CASH, name: 'Kas Tunai', type: 'CASH' },
];

const saleResponse: SaleResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  branchId: BRANCH_ID,
  branchName: 'Cabang Melati',
  accountId: ACCOUNT_CASH,
  accountName: 'Kas Tunai',
  userId: '22222222-2222-4222-8222-222222222222',
  cashierName: 'Kasir Satu',
  ledgerEntryId: '33333333-3333-4333-8333-333333333333',
  totalAmount: '40000.00',
  totalHpp: '16000.00',
  grossMargin: '24000.00',
  soldAt: '2026-08-17T03:00:00.000Z',
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      productId: KOPI_SUSU,
      productName: 'Es Kopi Susu',
      quantity: '2.0000',
      unitPriceAtSale: '20000.00',
      isPriceOverridden: false,
      hppAtSale: '8000.00',
      lineTotal: '40000.00',
    },
  ],
  createdAt: '2026-08-17T03:00:00.000Z',
  updatedAt: '2026-08-17T03:00:00.000Z',
};

/** Routes each GET to its fixture; the POST is left to the individual test. */
function mockReads(onPost?: () => Promise<unknown>) {
  vi.mocked(apiModule.apiFetch).mockImplementation(
    (path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path === '/sales') {
        return (onPost?.() ?? Promise.resolve(saleResponse)) as Promise<never>;
      }
      if (path === '/products')
        return Promise.resolve(products) as Promise<never>;
      if (path === '/raw-materials')
        return Promise.resolve(rawMaterials) as Promise<never>;
      if (path === '/accounts/payment-methods')
        return Promise.resolve(paymentMethods) as Promise<never>;
      if (path.startsWith('/sales?'))
        return Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }) as Promise<never>;
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
  );
}

async function renderScreen() {
  const result = renderWithClient(
    <PosScreen branchId={BRANCH_ID} role="KASIR" />,
  );
  await screen.findByTestId(`product-card-${KOPI_SUSU}`);
  return result;
}

function addToCart(productId: string) {
  fireEvent.click(screen.getByTestId(`product-card-${productId}`));
}

async function selectCash() {
  fireEvent.click(await screen.findByTestId(`payment-method-${ACCOUNT_CASH}`));
}

/** The single POST call recorded on the mock, for asserting the request body. */
function postCalls() {
  return vi
    .mocked(apiModule.apiFetch)
    .mock.calls.filter(
      ([path, init]) => path === '/sales' && init?.method === 'POST',
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  // `crypto.randomUUID` backs cart line ids; jsdom provides it, but pin it so
  // line ids are stable across assertions.
  let counter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () =>
      `00000000-0000-4000-8000-00000000000${(counter += 1)}` as `${string}-${string}-${string}-${string}-${string}`,
  );
});

describe('PosScreen — cart', () => {
  it('adds a product and shows an exact running total', async () => {
    mockReads();
    await renderScreen();

    addToCart(KOPI_SUSU);
    expect(screen.getByTestId('cart-total')).toHaveTextContent('20.000');

    addToCart(KOPI_SUSU);
    expect(screen.getByTestId('cart-total')).toHaveTextContent('40.000');
    // Merged into one line, not duplicated.
    expect(screen.getAllByTestId(/^cart-line-/)).toHaveLength(1);
  });

  it('shows the empty-cart copy before anything is selected', async () => {
    mockReads();
    await renderScreen();

    expect(screen.getByText('Pesanan masih kosong')).toBeInTheDocument();
    expect(
      screen.getByText('Pilih produk untuk memulai transaksi.'),
    ).toBeInTheDocument();
  });

  it('blocks a product with no recipe, which the server would always reject', async () => {
    mockReads();
    await renderScreen();

    const tile = screen.getByTestId(`product-card-${AIR}`);
    expect(tile).toBeDisabled();
    expect(screen.getByText('Belum ada resep')).toBeInTheDocument();
  });
});

describe('PosScreen — cart contention', () => {
  it('drops a sibling product headroom when the cart claims a shared material', async () => {
    mockReads();
    await renderScreen();

    // 10 liters of Susu: Es Kopi Susu (1/cup) shows 10, Latte (2/cup) shows 5.
    expect(
      screen.getByTestId(`product-headroom-${KOPI_SUSU}`),
    ).toHaveTextContent('Bisa dibuat 10');
    expect(screen.getByTestId(`product-headroom-${LATTE}`)).toHaveTextContent(
      'Bisa dibuat 5',
    );

    addToCart(KOPI_SUSU);
    addToCart(KOPI_SUSU);
    addToCart(KOPI_SUSU);

    // 3 liters claimed, 7 left. This is the number the per-product
    // `makeableQuantity` field cannot produce.
    expect(
      screen.getByTestId(`product-headroom-${KOPI_SUSU}`),
    ).toHaveTextContent('Bisa dibuat 7');
    expect(screen.getByTestId(`product-headroom-${LATTE}`)).toHaveTextContent(
      'Bisa dibuat 3',
    );
  });

  it('disables a tile once the cart has claimed everything', async () => {
    mockReads();
    await renderScreen();

    for (let i = 0; i < 5; i += 1) addToCart(LATTE);

    // 5 × 2 liters = the whole 10-liter pool.
    expect(screen.getByTestId(`product-card-${LATTE}`)).toBeDisabled();
    expect(screen.getByTestId(`product-card-${KOPI_SUSU}`)).toBeDisabled();
  });
});

describe('PosScreen — price override', () => {
  it('formats the field while keeping the raw value in the request', async () => {
    mockReads();
    await renderScreen();

    addToCart(KOPI_SUSU);
    fireEvent.click(screen.getByTestId(/^cart-price-edit-/));
    const priceInput = screen.getByTestId(/^cart-price-/);

    fireEvent.change(priceInput, { target: { value: '15000' } });

    // CurrencyInput displays Indonesian thousands, state keeps "15000".
    expect(priceInput).toHaveValue('15.000');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('15.000');
    expect(screen.getByText('Harga khusus')).toBeInTheDocument();

    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    const body = JSON.parse(String(postCalls()[0]?.[1]?.body));
    expect(body.items[0].unitPrice).toBe('15000');
  });

  it('omits unitPrice entirely when the price is untouched', async () => {
    mockReads();
    await renderScreen();

    addToCart(KOPI_SUSU);
    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    const body = JSON.parse(String(postCalls()[0]?.[1]?.body));
    expect(body.items[0]).not.toHaveProperty('unitPrice');
    expect(body.branchId).toBe(BRANCH_ID);
    expect(body.accountId).toBe(ACCOUNT_CASH);
    expect(body).not.toHaveProperty('userId');
  });
});

describe('PosScreen — submit', () => {
  it('shows the receipt and clears the cart on success', async () => {
    mockReads();
    await renderScreen();

    addToCart(KOPI_SUSU);
    addToCart(KOPI_SUSU);
    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));

    // The receipt renders the SERVER's total, not a recomputed one.
    expect(await screen.findByTestId('sale-success-total')).toHaveTextContent(
      '40.000',
    );
    expect(screen.getByText('Pesanan masih kosong')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^cart-line-/)).toHaveLength(0);
  });

  it('cannot be submitted twice by a rapid double tap', async () => {
    let resolvePost: ((value: unknown) => void) | undefined;
    mockReads(() => new Promise((resolve) => (resolvePost = resolve)));
    await renderScreen();

    addToCart(KOPI_SUSU);
    await selectCash();

    const button = screen.getByTestId('cart-submit');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    resolvePost?.(saleResponse);
    await screen.findByTestId('sale-success-total');
    expect(postCalls()).toHaveLength(1);
  });

  it('cannot be submitted without a payment method', async () => {
    mockReads();
    await renderScreen();

    addToCart(KOPI_SUSU);
    expect(screen.getByTestId('cart-submit')).toBeDisabled();
    expect(
      screen.getByText('Pilih metode pembayaran untuk melanjutkan.'),
    ).toBeInTheDocument();
  });
});

describe('PosScreen — submit failures', () => {
  it('keeps the cart and marks the offending line on insufficient stock', async () => {
    const error = new apiModule.ApiError('Insufficient stock', 409, {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock',
      details: {
        shortfalls: [
          {
            rawMaterialId: SUSU,
            name: 'Susu UHT',
            required: '12.0000',
            available: '8.0000',
          },
        ],
      },
    });
    mockReads(() => Promise.reject(error));
    await renderScreen();

    addToCart(KOPI_SUSU);
    fireEvent.click(screen.getByTestId(/^cart-price-edit-/));
    const priceInput = screen.getByTestId(/^cart-price-/);
    fireEvent.change(priceInput, { target: { value: '15000' } });
    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));

    const banner = await screen.findByTestId('cart-error-banner');
    expect(banner).toHaveAttribute('data-kind', 'INSUFFICIENT_STOCK');
    expect(banner).toHaveTextContent('Susu UHT');

    // The cart is intact — nothing silently cleared — and the override survived.
    expect(screen.getAllByTestId(/^cart-line-/)).toHaveLength(1);
    expect(screen.getByTestId(/^cart-price-/)).toHaveValue('15.000');
    expect(screen.getAllByTestId(/^cart-line-/)[0]).toHaveAttribute(
      'data-over-committed',
      'true',
    );
  });

  it('lets the cashier retry after fixing the cart, sending the corrected payload', async () => {
    const error = new apiModule.ApiError('Insufficient stock', 409, {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock',
      details: {
        shortfalls: [
          {
            rawMaterialId: SUSU,
            name: 'Susu UHT',
            required: '3.0000',
            available: '2.0000',
          },
        ],
      },
    });

    let attempt = 0;
    mockReads(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(error)
        : Promise.resolve(saleResponse);
    });
    await renderScreen();

    addToCart(KOPI_SUSU);
    addToCart(KOPI_SUSU);
    addToCart(KOPI_SUSU);
    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));
    await screen.findByTestId('cart-error-banner');

    // Reduce, then retry.
    fireEvent.click(screen.getByTestId(/^cart-decrement-/));
    fireEvent.click(screen.getByTestId('cart-submit'));

    await waitFor(() => expect(postCalls()).toHaveLength(2));
    const second = JSON.parse(String(postCalls()[1]?.[1]?.body));
    expect(second.items[0].quantity).toBe('2.0000');
    await screen.findByTestId('sale-success-total');
  });

  it('preserves the cart on a 403 rather than clearing it', async () => {
    mockReads(() =>
      Promise.reject(new apiModule.ApiError('Forbidden', 403, null)),
    );
    await renderScreen();

    addToCart(KOPI_SUSU);
    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));

    const banner = await screen.findByTestId('cart-error-banner');
    expect(banner).toHaveAttribute('data-kind', 'FORBIDDEN');
    expect(banner).toHaveTextContent('tidak berwenang');
    expect(screen.getAllByTestId(/^cart-line-/)).toHaveLength(1);
  });

  it('offers verification, not retry, when the outcome is unknown', async () => {
    // No idempotency key on POST /sales, so a blind retry could double-charge.
    mockReads(() => Promise.reject(new TypeError('Failed to fetch')));
    await renderScreen();

    addToCart(KOPI_SUSU);
    await selectCash();
    fireEvent.click(screen.getByTestId('cart-submit'));

    const banner = await screen.findByTestId('cart-error-banner');
    expect(banner).toHaveAttribute('data-kind', 'UNCERTAIN');
    expect(screen.getByTestId('check-recent-sales')).toBeInTheDocument();

    // Submit stays locked until the cashier confirms what happened.
    expect(screen.getByTestId('cart-submit')).toBeDisabled();
    expect(screen.getAllByTestId(/^cart-line-/)).toHaveLength(1);

    fireEvent.click(screen.getByTestId('check-recent-sales'));
    await waitFor(() =>
      expect(
        screen.getByText('Belum ada penjualan tercatat di cabang ini.'),
      ).toBeInTheDocument(),
    );
  });
});
