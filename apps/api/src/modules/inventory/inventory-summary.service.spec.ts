import { InventorySummaryService } from './inventory-summary.service';

/**
 * Menjaga satu hal saja: transaksi read di service ini punya batas yang
 * dinyatakan, bukan default 5000 ms Prisma. ERR-045 — batas default itu
 * membuat endpoint mengembalikan HTTP 500 di bawah beban terhadap volume
 * nyata, sementara seluruh test suite tetap hijau karena tidak satu pun
 * menjalankannya di bawah beban.
 */
describe('InventorySummaryService', () => {
  const rawMaterial = { findMany: jest.fn() };
  const stockMovement = { groupBy: jest.fn() };
  // Callback-nya diketik di sini, bukan lewat mockImplementation, supaya
  // `mock.calls` tidak bertipe `any` — lint repo ini menolak pembacaan
  // anggota dari `any`.
  const $transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    // Jalankan callback-nya sungguhan supaya bentuk query di dalamnya ikut
    // terpanggil, lalu kembalikan hasilnya apa adanya.
    fn({ rawMaterial, stockMovement }),
  );

  const service = new InventorySummaryService({
    rawMaterial,
    stockMovement,
    $transaction,
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    rawMaterial.findMany.mockResolvedValue([]);
    stockMovement.groupBy.mockResolvedValue([]);
  });

  it('memberi transaksinya batas waktu eksplisit, bukan default 5000 ms Prisma', async () => {
    await service.findByPeriod({ period: '2026-08' });

    expect($transaction).toHaveBeenCalledTimes(1);
    // Argumen kedua tidak ada di tipe callback di atas justru karena service
    // inilah yang mengirimkannya; itu yang sedang diuji.
    const [, options] = $transaction.mock.calls[0] as unknown as [
      unknown,
      { maxWait?: number; timeout?: number } | undefined,
    ];
    expect(options).toBeDefined();
    expect(options?.timeout).toBeGreaterThan(5_000);
    expect(options?.maxWait).toBeGreaterThan(0);
  });

  it('tetap membaca ketiga sumbernya di dalam satu transaksi', async () => {
    await service.findByPeriod({ period: '2026-08' });

    // Konsistensi satu-titik-waktu adalah alasan transaksi ini ada; kalau
    // suatu saat ada yang memindahkan salah satu query ke luar, test ini yang
    // memberitahu.
    expect(rawMaterial.findMany).toHaveBeenCalledTimes(1);
    expect(stockMovement.groupBy).toHaveBeenCalledTimes(2);
  });
});
