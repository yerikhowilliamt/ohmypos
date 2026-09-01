# Sampel e-Statement (sintetis)

Berkas uji untuk kedua parser PDF, dipakai untuk menguji alur unggah
Rekonsiliasi → Import secara manual di browser dan sebagai fixture
`*.samples.spec.ts` di `apps/api`.

**Semuanya sintetis.** Tidak ada nomor rekening, nama, atau transaksi nyata di dalamnya.

> **E-statement asli tidak boleh di-commit.** `.gitignore` menolak semua `*.pdf`
> di direktori ini kecuali berkas contoh yang namanya diawali `NN-mandiri-` atau
> `NN-bca-`. Statement asli memuat nomor rekening, nama pemilik, nomor telepon,
> dan nama lawan transaksi (ADR-022, ADR-026).

---

## Mandiri — `MandiriPdfParser`

`apps/api/src/modules/import/parsers/mandiri-pdf.parser.ts`

Geometri halaman sengaja dibuat persis mengikuti kolom yang di-slice parser — `No` di x<40,
tanggal 40–120, keterangan 120–370, nominal 370–460, saldo ≥460, jarak antarbaris 46pt —
plus header, judul kolom, footer, dan halaman disclaimer yang memang harus diabaikan parser.

| Berkas | Isi | Hasil parse yang diharapkan |
|---|---|---|
| `01-mandiri-juli-2026-normal.pdf` | 1 halaman, 9 transaksi campuran | 9 transaksi (4 INFLOW / 5 OUTFLOW) |
| `02-mandiri-agustus-2026-multipage.pdf` | 4 halaman + disclaimer, 28 transaksi | 28 transaksi; header/footer tiap halaman terbuang |
| `03-mandiri-juni-2026-duplikat.pdf` | 3 baris identik (tanggal, jam, keterangan, nominal sama) | 6 transaksi dengan 6 `dedupHash` unik |
| `04-mandiri-mei-2026-edge-cases.pdf` | 12 baris: 6 rusak + 6 valid | 6 transaksi; 6 baris rusak dilewati |
| `05-mandiri-april-2026-kosong.pdf` | periode tanpa transaksi | 0 transaksi, tanpa error |

Rincian `04-…-edge-cases.pdf`:

- **Harus dilewati:** tanggal `31 Feb 2026`, nominal hilang, tanggal hilang,
  nominal tanpa tanda `+`/`-`, nominal `+0,00`, keterangan kosong.
- **Harus lolos:** bulan Inggris (`May`) dan Indonesia (`Mei`), nominal besar
  `125.750.000,00`, nominal terkecil `1,00`, baris tanpa jam, dan keterangan panjang
  yang dipotong tepat di 500 karakter (batas `CreateBankTransactionSchema.description`).

### Membuat ulang

```bash
node docs/e-statements/make-statements.js docs/e-statements
```

`gen-mandiri-pdf.js` menulis byte PDF secara langsung — tanpa dependency baru.

---

## BCA — `BcaPdfParser`

`apps/api/src/modules/import/parsers/bca-pdf.parser.ts`

Tata letak BCA berbeda total dari Mandiri, dan sampel ini meniru perbedaannya
(diukur dari statement asli 7 halaman / 63 transaksi, ADR-026):

- **Tidak ada kolom nomor baris.** Baris dikunci pada sel tanggal `DD/MM` di x 40–85.
- **Tinggi baris berubah-ubah.** Baris rincian menggantung *di bawah* penanda tanggal,
  berjarak 12.1pt; jarak baris terakhir ke penanda berikutnya 14.1pt. Satu baris bisa
  setinggi 1 baris (`BIAYA ADM`) atau 5 baris (top-up dompet digital).
- **Arah transaksi dari kolom penanda,** bukan dari tanda `+`/`-`: `DB` di x≈442 berarti
  OUTFLOW, sel kosong berarti INFLOW.
- **Format uang terbalik dari Mandiri:** `205,000.00` — koma pemisah ribuan, titik desimal.
- **Tahun tidak ada di baris.** Hanya ada di header, sebagai `PERIODE : AGUSTUS 2026`.
- **Blok total penutup** (`SALDO AWAL`/`MUTASI CR`/`MUTASI DB`/`SALDO AKHIR`) meletakkan
  nominalnya di kolom **CBG** dan jumlah transaksinya di kolom **MUTASI**, hanya ~44pt di
  bawah baris terakhir yang pendek — parser harus menolaknya lewat lantai eksplisit,
  bukan sekadar batas tinggi baris.

| Berkas | Isi | Hasil parse yang diharapkan |
|---|---|---|
| `01-bca-juli-2026-normal.pdf` | 1 halaman, 9 transaksi, baris terakhir 1 baris tepat di atas blok total | 9 transaksi (4 INFLOW / 5 OUTFLOW); baris terakhir `BUNGA 0998` tanpa sisipan blok total |
| `02-bca-agustus-2026-multipage.pdf` | beberapa halaman, 30 transaksi harian | 30 transaksi (20 INFLOW / 10 OUTFLOW); header, footer "Bersambung", dan blok total terbuang |
| `03-bca-juni-2026-duplikat.pdf` | 3 baris identik byte-per-byte + 1 baris arah berlawanan | 6 transaksi dengan 6 `dedupHash` unik |
| `04-bca-mei-2026-edge-cases.pdf` | 12 baris: 7 rusak + 5 valid | 5 transaksi; 7 baris rusak dilewati |
| `05-bca-april-2026-kosong.pdf` | periode tanpa transaksi (hanya `SALDO AWAL`) | 0 transaksi, tanpa error |
| `06-bca-januari-2027-lintas-tahun.pdf` | statement JANUARI 2027 berisi baris `31/12` | 3 transaksi; baris `31/12` bertanggal **2026**-12-31 |

Rincian `04-…-edge-cases.pdf`:

- **Harus dilewati:** baris `SALDO AWAL` (tanpa nominal), tanggal `31/02`,
  bulan `15/06` di luar periode MEI, nominal hilang, nominal tanpa desimal (`100000`),
  nominal berformat Mandiri (`1.000.000,00`), nominal `0.00`, dan keterangan kosong.
- **Harus lolos:** nominal besar `125,750,000.00`, nominal terkecil `1.00`, baris CR
  tanpa penanda `DB`, dan keterangan 12 baris yang dipotong tepat di 500 karakter.

### Membuat ulang

```bash
node docs/e-statements/make-bca-statements.js docs/e-statements
```

`gen-bca-pdf.js` memakai kembali `buildPdf` dari `gen-mandiri-pdf.js` — tanpa dependency baru.

---

Ubah daftar transaksi di `make-statements.js` / `make-bca-statements.js` untuk menambah
skenario. Posisi kolom x ada di `gen-mandiri-pdf.js` / `gen-bca-pdf.js`; kalau parser
mengubah geometri kolomnya, generator dan parser harus diselaraskan (lihat catatan
geometri di `AGENTS.md` § Known Constraints).
