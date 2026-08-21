---
name: e2e-playwright
description: >
  Jalankan frontend end-to-end testing untuk OhMyPos menggunakan MCP Playwright.
  Gunakan skill ini ketika user meminta testing UI, smoke test, atau verifikasi
  alur pengguna di browser secara real-time tanpa menulis file spec Playwright.
  Skill ini menyediakan prosedur standar, credential seed, dan pattern interaksi
  yang sudah divalidasi untuk app OhMyPos (Next.js di localhost:3001).
---

# E2E Frontend Testing — OhMyPos (MCP Playwright)

## Prasyarat

- Dev server **HARUS** berjalan sebelum testing:
  - `apps/web` → `http://localhost:3001` (Next.js)
  - `apps/api` → `http://localhost:4015` (NestJS)
- Jika salah satu tidak jalan, sarankan user menjalankan `npm run dev` di root repo dulu.
- Cek status dengan: `curl -s http://localhost:3001/login | head -c 50`

## Seed Credentials (dari `apps/api/prisma/seed.ts`)

| Role  | Email                   | Password      |
|-------|-------------------------|---------------|
| OWNER | owner@ohmypos.local     | ChangeMe123!  |
| ADMIN | admin@ohmypos.local     | ChangeMe123!  |
| KASIR | kasir@ohmypos.local     | ChangeMe123!  |

> Default `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` dapat di-override via `.env`.

## Workflow Standar Testing

### 1. Login

```
1. browser_navigate → http://localhost:3001/login
2. browser_snapshot  → verifikasi field Email + Kata sandi + button Masuk muncul
3. browser_fill_form → isi email + password (selector: input[type="email"], input[type="password"])
4. browser_click     → button:has-text("Masuk")
5. browser_snapshot  → verifikasi redirect ke /master-data (OWNER/ADMIN) atau /sales (KASIR)
```

### 2. Master Data — Raw Material CRUD

```
1. Navigate ke /master-data (sudah redirect otomatis setelah login OWNER/ADMIN)
2. Klik tab: [role="tab"]:has-text("Bahan Baku")
3. Klik: button:has-text("Tambah Bahan Baku")
4. Isi form via browser_fill_form:
   - input#rm-name     → nama bahan baku
   - input#rm-unit     → satuan (kg, liter, gr, dll)
   - input#rm-cost     → biaya (raw angka seperti "18000"; UI auto-format ke "18.000")
   - input#rm-threshold → batas stok rendah
5. Verifikasi format harga (CurrencyInput):
   browser_evaluate → () => document.querySelector('input#rm-cost')?.value
   Expected: "18.000" (dengan titik ribuan, bukan "18000")
6. Submit: ambil ref dari snapshot → klik button "Tambah Bahan Baku" di dalam dialog
7. Verifikasi tabel diperbarui otomatis (tab counter naik, row baru muncul)
```

### 3. Master Data — Product CRUD

```
1. Klik tab: [role="tab"]:has-text("Produk")
2. Klik: button:has-text("Tambah Produk")
3. Isi form:
   - input#product-name  → nama produk/menu
   - input#product-price → harga jual (raw angka; UI auto-format)
4. Verifikasi format harga:
   browser_evaluate → () => document.querySelector('input#product-price')?.value
   Expected: "25.000" bukan "25000"
5. Submit: button[type="submit"]
6. Verifikasi produk muncul di tabel dengan kolom HPP = "—" (belum ada resep)
```

### 4. Recipe / BOM Editor

```
1. Klik "Edit Resep" pada row produk target
2. Klik "Tambah Bahan" untuk menambah ingredient row
3. Pilih bahan di combobox (option text: "Nama (satuan) — Rp harga/satuan")
4. Isi takaran di textbox Takaran per Porsi
5. Klik "Simpan & Hitung HPP"
6. Verifikasi di tabel produk:
   - Kolom "Live HPP" terisi (bukan "—")
   - Kolom "Margin" terisi sebagai persentase (%)
   - Label status berubah dari "Belum ada resep" → "Resep aktif"
```

## Pola Selector yang Sudah Divalidasi

| Elemen                       | Selector / Strategy                               |
|------------------------------|---------------------------------------------------|
| Tab switcher                 | `[role="tab"]:has-text("Bahan Baku")`             |
| Dialog submit button         | Gunakan ref snapshot (misal `e208`) atau `button:has-text("Tambah Bahan Baku")` |
| Ingredient select row 0      | `getByTestId('raw-material-select-0')`            |
| Quantity input row 0         | `getByTestId('quantity-input-0')`                 |
| Harga input (CurrencyInput)  | `input#rm-cost`, `input#product-price`            |
| Submit form produk           | `button[type="submit"]`                           |
| Simpan HPP                   | `button:has-text("Simpan & Hitung HPP")`          |
| Login email                  | `input[type="email"]` atau `textbox:nth-of-type(1)` |
| Login password               | `input[type="password"]` atau `textbox:nth-of-type(2)` |

## Alur Kerja: Ambil Snapshot → Baca Ref → Klik Ref

Strategi terbaik: **selalu ambil snapshot dulu**, baca `ref=eXXX` dari output yaml,
baru gunakan ref tersebut untuk click/fill. Ini menghindari ambiguous selector.

```
browser_snapshot → baca ref dari yaml output
browser_click → target: "eXXX" (ref dari snapshot)
```

## Lokasi Penyimpanan Screenshot

Setiap kali memanggil tool `playwright_browser_take_screenshot`, simpan file hasil screenshot ke dalam folder **`docs/screenshoots/`** (contoh: `docs/screenshoots/login-attendance-warning.png`).

```
playwright_browser_take_screenshot → filename: "docs/screenshoots/<nama-file>.png"
```

## Verifikasi Otomatis setelah Mutasi

TanStack Query (`queryClient.invalidateQueries`) otomatis memperbarui data
setelah create/update/delete tanpa perlu reload atau "Segarkan Data" manual.
Cukup:
1. Ambil snapshot setelah dialog ditutup
2. Verifikasi counter tab bertambah (misal: "Bahan Baku (2)")
3. Verifikasi row baru muncul di tabel

## Known Gotchas

- **CurrencyInput behavior**: `browser_fill_form` dengan raw angka (misal `"18000"`)
  akan dikonversi oleh React onChange handler menjadi `"18.000"` di UI.
  Payload yang dikirim ke backend tetap raw string `"18000"` melalui `unformatThousands`.
- **Dialog button conflict**: Button "Tambah Bahan Baku" ada di header tabel DAN
  di dalam dialog. Gunakan ref snapshot dari dialog (`e208`) untuk menghindari
  klik yang salah.
- **Tab selector**: `tab:has-text(...)` tidak bekerja. Gunakan `[role="tab"]:has-text(...)`.
- **Session persistence**: Setelah model overload/reconnect, browser session tetap
  aktif. Tidak perlu re-login kecuali cookie `omp_session` expired.
- **browser_evaluate**: Parameter wajib bernama `function`, bukan `expression`.
  Contoh benar: `{ "function": "() => document.querySelector('#id')?.value" }`

## Role Access Boundaries (perlu diverifikasi E2E)

| Route           | OWNER | ADMIN | KASIR      |
|-----------------|-------|-------|------------|
| /master-data    | ✓     | ✓     | ✗ redirect |
| /reconciliation | ✓     | ✓     | ✗ redirect |
| /expenses       | ✓     | ✗     | ✗ redirect |
| /inventory      | ✓     | ✗     | ✗ redirect |
| /reports        | ✓     | ✗     | ✗ redirect |
| /users          | ✓     | ✗     | ✗ redirect |
| /sales          | ✓     | ✗     | ✓          |

Test role boundary: login sebagai KASIR → akses `/master-data` langsung →
harus redirect (tidak boleh render halaman Data Master).
