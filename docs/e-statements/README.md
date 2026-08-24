# Sampel e-Statement Mandiri (sintetis)

Berkas uji untuk `MandiriPdfParser` (`apps/api/src/modules/import/parsers/mandiri-pdf.parser.ts`),
dipakai untuk menguji alur unggah Rekonsiliasi → Import secara manual di browser.

**Semuanya sintetis.** Tidak ada nomor rekening, nama, atau transaksi nyata di dalamnya.

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

## Membuat ulang

`gen-mandiri-pdf.js` menulis byte PDF secara langsung — tanpa dependency baru.

```bash
node docs/e-statements/make-statements.js docs/e-statements
```

Ubah daftar transaksi di `make-statements.js` untuk menambah skenario. Kolom x-position
ada di `gen-mandiri-pdf.js`; kalau parser mengubah geometri kolomnya, keduanya harus
diselaraskan (lihat catatan geometri di `AGENTS.md` § Known Constraints).
