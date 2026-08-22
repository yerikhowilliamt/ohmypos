const fs = require('fs');
const path = require('path');
const { buildStatement, ledger, idr } = require('./gen-mandiri-pdf');

const OUT = process.argv[2] || path.join(__dirname, 'mandiri-samples');
fs.mkdirSync(OUT, { recursive: true });

const ACCOUNT = { holder: 'PT OHMYPOS NUSANTARA', account: '1380027697569' };

function write(name, meta, entries, options = {}) {
  const { rows, closing } = ledger(meta.opening, entries);
  const buffer = buildStatement({ ...ACCOUNT, ...meta, closing }, rows, options);
  fs.writeFileSync(path.join(OUT, name), buffer);
  console.log(`${name.padEnd(42)} ${String(rows.length).padStart(3)} rows  ${(buffer.length / 1024).toFixed(1)} KB  saldo akhir ${idr(closing)}`);
}

// 1 — happy path: one page, mixed inflow/outflow, everything well-formed.
write('01-mandiri-juli-2026-normal.pdf', { period: '01 Jul 2026 - 31 Jul 2026', opening: 12_500_000 }, [
  { date: '01 Jul 2026', time: '08:14:23 WIB', amount: +4_850_000, description: ['QRIS SETTLEMENT', 'MERCHANT OHMYPOS CABANG SUDIRMAN 20260701'] },
  { date: '02 Jul 2026', time: '11:02:47 WIB', amount: -1_250_000, description: ['TRANSFER E-BANKING', 'CV SUMBER PANGAN SEJAHTERA - PEMBELIAN BAHAN BAKU'] },
  { date: '03 Jul 2026', time: '09:31:05 WIB', amount: +3_120_500, description: ['QRIS SETTLEMENT', 'MERCHANT OHMYPOS CABANG KEMANG 20260703'] },
  { date: '05 Jul 2026', time: '14:48:19 WIB', amount: -775_000, description: ['PEMBAYARAN PLN', 'IDPEL 531402118776 JULI 2026'] },
  { date: '08 Jul 2026', time: '10:07:52 WIB', amount: +9_400_000, description: ['TRANSFER MASUK', 'PT KATERING NUSA RASA - INVOICE INV-2026-0712'] },
  { date: '12 Jul 2026', time: '16:22:10 WIB', amount: -6_800_000, description: ['TRANSFER E-BANKING', 'PAYROLL KARYAWAN JULI 2026'] },
  { date: '18 Jul 2026', time: '13:05:44 WIB', amount: -2_150_000, description: ['DEBIT KARTU', 'TOKOPEDIA - PERALATAN DAPUR'] },
  { date: '25 Jul 2026', time: '07:59:31 WIB', amount: +5_675_250, description: ['QRIS SETTLEMENT', 'MERCHANT OHMYPOS CABANG SUDIRMAN 20260725'] },
  { date: '31 Jul 2026', time: '23:59:00 WIB', amount: -50_000, description: ['BIAYA ADMINISTRASI', 'BIAYA ADM REKENING JULI 2026'] },
]);

// 2 — four pages of rows plus the disclaimer page: exercises cross-page flattening.
const daily = [];
for (let day = 1; day <= 28; day++) {
  const dd = String(day).padStart(2, '0');
  daily.push(
    day % 4 === 0
      ? { date: `${dd} Agu 2026`, time: '15:40:12 WIB', amount: -(300_000 + day * 17_500), description: ['TRANSFER E-BANKING', `PEMBAYARAN SUPPLIER BATCH ${dd}`] }
      : { date: `${dd} Agu 2026`, time: '08:05:00 WIB', amount: +(1_200_000 + day * 43_250), description: ['QRIS SETTLEMENT', `MERCHANT OHMYPOS CABANG KEMANG 202608${dd}`] },
  );
}
write('02-mandiri-agustus-2026-multipage.pdf', { period: '01 Agu 2026 - 28 Agu 2026', opening: 8_250_000 }, daily);

// 3 — three byte-identical rows: the dedupHash counter must keep them distinct.
write('03-mandiri-juni-2026-duplikat.pdf', { period: '01 Jun 2026 - 30 Jun 2026', opening: 3_000_000 }, [
  { date: '04 Jun 2026', time: '12:00:00 WIB', amount: +250_000, description: ['QRIS PAYMENT', 'ORDER MEJA 04'] },
  { date: '04 Jun 2026', time: '12:00:00 WIB', amount: +250_000, description: ['QRIS PAYMENT', 'ORDER MEJA 04'] },
  { date: '04 Jun 2026', time: '12:00:00 WIB', amount: +250_000, description: ['QRIS PAYMENT', 'ORDER MEJA 04'] },
  { date: '04 Jun 2026', time: '12:00:00 WIB', amount: -250_000, description: ['QRIS PAYMENT', 'ORDER MEJA 04'] },
  { date: '05 Jun 2026', time: '12:00:00 WIB', amount: +250_000, description: ['QRIS PAYMENT', 'ORDER MEJA 04'] },
  { date: '06 Jun 2026', time: '09:18:37 WIB', amount: -1_425_000, description: ['TRANSFER E-BANKING', 'UD BERKAH TANI - SAYUR MINGGUAN'] },
]);

// 4 — malformed rows the parser must skip, next to valid ones it must still keep.
write('04-mandiri-mei-2026-edge-cases.pdf', { period: '01 Mei 2026 - 31 Mei 2026', opening: 1_000_000 }, [
  { date: '01 May 2026', time: '10:00:00 WIB', amount: +1_500_000, description: ['QRIS SETTLEMENT', 'BULAN INGGRIS - MAY'] },
  { date: '02 Mei 2026', time: '10:00:00 WIB', amount: +2_000_000, description: ['QRIS SETTLEMENT', 'BULAN INDONESIA - MEI'] },
  { date: '31 Feb 2026', time: '10:00:00 WIB', amount: +999_000, description: ['TANGGAL TIDAK VALID', 'HARUS DILEWATI PARSER'] },
  { date: '05 Mei 2026', time: '10:00:00 WIB', amount: 0, nominal: null, description: ['NOMINAL HILANG', 'HARUS DILEWATI PARSER'] },
  { date: null, time: '10:00:00 WIB', amount: -125_000, description: ['TANGGAL HILANG', 'HARUS DILEWATI PARSER'] },
  { date: '07 Mei 2026', time: '10:00:00 WIB', amount: 0, nominal: '1.000.000,00', description: ['NOMINAL TANPA TANDA', 'HARUS DILEWATI PARSER'] },
  { date: '08 Mei 2026', time: '10:00:00 WIB', amount: 0, nominal: '+0,00', description: ['NOMINAL NOL', 'HARUS DILEWATI PARSER'] },
  { date: '09 Mei 2026', time: '10:00:00 WIB', amount: -350_000, description: [] },
  { date: '10 Mei 2026', time: null, amount: +125_750_000, description: ['TRANSFER MASUK NOMINAL BESAR', 'PT INVESTASI KULINER NUSANTARA - SETORAN MODAL'] },
  { date: '11 Mei 2026', time: '23:59:59 WIB', amount: -1, description: ['NOMINAL TERKECIL', 'PEMBULATAN SATU RUPIAH'] },
  { date: '12 Mei 2026', time: '10:00:00 WIB', amount: -2_400_000, description: Array.from({ length: 12 }, (_, i) => `KETERANGAN PANJANG BAGIAN ${i + 1} PEMBAYARAN GABUNGAN LINTAS SUPPLIER UNTUK PENGUJIAN PEMOTONGAN 500 KARAKTER`) },
  { date: '13 Mei 2026', time: '10:00:00 WIB', amount: +875_000, description: ['QRIS SETTLEMENT', 'BARIS VALID TERAKHIR'] },
]);

// 5 — a period with no activity at all: header, footer and disclaimer only.
write('05-mandiri-april-2026-kosong.pdf', { period: '01 Apr 2026 - 30 Apr 2026', opening: 750_000 }, []);
