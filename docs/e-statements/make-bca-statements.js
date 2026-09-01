const fs = require('fs');
const path = require('path');
const { buildStatement, ledger, bca } = require('./gen-bca-pdf');

const OUT = process.argv[2] || path.join(__dirname, 'bca-samples');
fs.mkdirSync(OUT, { recursive: true });

const ACCOUNT = { holder: 'PT OHMYPOS NUSANTARA', account: '3940774470' };

function write(name, meta, entries) {
  const { rows, totals } = ledger(meta.opening, meta.openingDate, entries);
  const buffer = buildStatement({ ...ACCOUNT, ...meta, ...totals }, rows);
  fs.writeFileSync(path.join(OUT, name), buffer);
  console.log(
    `${name.padEnd(38)} ${String(rows.length).padStart(3)} rows  ${(buffer.length / 1024).toFixed(1)} KB  saldo akhir ${bca(totals.closing)}`,
  );
}

// 1 — happy path: one page, mixed CR/DB, single- and multi-line detail blocks.
write(
  '01-bca-juli-2026-normal.pdf',
  { period: 'JULI 2026', opening: 469_033.88, openingDate: '01/07' },
  [
    { date: '01/07', keterangan: 'TRANSAKSI DEBIT', amount: -100_000, detail: ['TGL: 01/07', 'QR 914', '00000.00PONDOK SAB'], showSaldo: true },
    { date: '01/07', keterangan: 'TRSF E-BANKING CR', amount: +205_000, detail: ['0107/FTSCY/WS95051', '205000.00', 'GoPay Bank Transfe', 'ID2621335379533AJQ', 'DOMPET ANAK BANGSA'], showSaldo: true },
    { date: '02/07', keterangan: 'TRSF E-BANKING DB', amount: -151_000, detail: ['0207/FTFVA/WS95031', '70001/GO-PAY TOPUP', '-', '-', '085743610223'] },
    { date: '04/07', keterangan: 'BIAYA ADM', amount: -10_000, cbg: '0998', showSaldo: true },
    { date: '09/07', keterangan: 'BI-FAST CR', amount: +250_000, detail: ['BIF TRANSFER DR', '562', 'YERIKHO WILLIAM TA'] },
    { date: '09/07', keterangan: 'BI-FAST DB', amount: -210_000, detail: ['BIF TRANSFER KE', '008', 'NAYLA CHALISA PUTR', 'M-BCA'] },
    { date: '09/07', keterangan: 'BI-FAST DB', amount: -2_500, detail: ['BIF BIAYA TXN KE', '008'], showSaldo: true },
    { date: '25/07', keterangan: 'KR OTOMATIS', amount: +1_350_000, detail: ['SETTLEMENT QRIS', 'MERCHANT OHMYPOS'], showSaldo: true },
    { date: '31/07', keterangan: 'BUNGA', amount: +1_204.11, cbg: '0998', showSaldo: true },
  ],
);

// 2 — several pages: exercises cross-page flattening and the repeated header.
const daily = [];
for (let day = 1; day <= 30; day++) {
  const dd = String(day).padStart(2, '0');
  daily.push(
    day % 3 === 0
      ? { date: `${dd}/08`, keterangan: 'TRSF E-BANKING DB', amount: -(120_000 + day * 3_500), detail: [`${dd}08/FTFVA/WS95031`, '70001/GO-PAY TOPUP', '-', '-', '085743610223'] }
      : { date: `${dd}/08`, keterangan: 'BI-FAST CR', amount: +(95_000 + day * 4_250), detail: ['BIF TRANSFER DR', '562', `SETORAN HARIAN ${dd}`], showSaldo: day % 5 === 0 },
  );
}
write('02-bca-agustus-2026-multipage.pdf', { period: 'AGUSTUS 2026', opening: 8_250_000, openingDate: '01/08' }, daily);

// 3 — byte-identical rows: the dedupHash counter must keep them distinct.
write(
  '03-bca-juni-2026-duplikat.pdf',
  { period: 'JUNI 2026', opening: 3_000_000, openingDate: '01/06' },
  [
    { date: '04/06', keterangan: 'TRANSAKSI DEBIT', amount: -25_000, detail: ['TGL: 04/06', 'QR 002', '00000.00TOKO RIAN'] },
    { date: '04/06', keterangan: 'TRANSAKSI DEBIT', amount: -25_000, detail: ['TGL: 04/06', 'QR 002', '00000.00TOKO RIAN'] },
    { date: '04/06', keterangan: 'TRANSAKSI DEBIT', amount: -25_000, detail: ['TGL: 04/06', 'QR 002', '00000.00TOKO RIAN'] },
    // Same amount and text on the same day, opposite direction — a different
    // signature, so it must not fall into the counted-duplicate bucket above.
    { date: '04/06', keterangan: 'TRANSAKSI DEBIT', amount: +25_000, detail: ['TGL: 04/06', 'QR 002', '00000.00TOKO RIAN'] },
    { date: '05/06', keterangan: 'TRANSAKSI DEBIT', amount: -25_000, detail: ['TGL: 05/06', 'QR 002', '00000.00TOKO RIAN'] },
    { date: '06/06', keterangan: 'BI-FAST DB', amount: -1_425_000, detail: ['BIF TRANSFER KE', '011', 'UD BERKAH TANI'], showSaldo: true },
  ],
);

// 4 — malformed rows the parser must skip, beside valid ones it must still keep.
// `countInSummary: false` keeps a deliberately broken row out of the printed
// totals, so the summary block still reconciles against what the parser returns.
write(
  '04-bca-mei-2026-edge-cases.pdf',
  { period: 'MEI 2026', opening: 1_000_000, openingDate: '01/05' },
  [
    { date: '01/05', keterangan: 'BI-FAST CR', amount: +1_500_000, detail: ['BIF TRANSFER DR', '562', 'BARIS VALID PERTAMA'] },
    { date: '31/02', keterangan: 'TANGGAL TIDAK VALID', amount: -999_000, detail: ['HARUS DILEWATI PARSER'], countInSummary: false },
    { date: '15/06', keterangan: 'BULAN DI LUAR PERIODE', amount: -888_000, detail: ['HARUS DILEWATI PARSER'], countInSummary: false },
    { date: '05/05', keterangan: 'NOMINAL HILANG', mutasi: null, amount: 0, flag: 'DB', detail: ['HARUS DILEWATI PARSER'], countInSummary: false },
    { date: '06/05', keterangan: 'NOMINAL TANPA DESIMAL', mutasi: '100000', amount: 0, flag: 'DB', detail: ['HARUS DILEWATI PARSER'], countInSummary: false },
    { date: '07/05', keterangan: 'NOMINAL FORMAT MANDIRI', mutasi: '1.000.000,00', amount: 0, flag: 'DB', detail: ['HARUS DILEWATI PARSER'], countInSummary: false },
    { date: '08/05', keterangan: 'NOMINAL NOL', mutasi: '0.00', amount: 0, flag: 'DB', detail: ['HARUS DILEWATI PARSER'], countInSummary: false },
    { date: '09/05', keterangan: '', mutasi: '350,000.00', amount: 0, flag: 'DB', detail: [], countInSummary: false },
    { date: '10/05', keterangan: 'BI-FAST CR', amount: +125_750_000, detail: ['BIF TRANSFER DR', '011', 'NOMINAL BESAR'] },
    { date: '11/05', keterangan: 'BIAYA ADM', amount: -1, cbg: '0998', detail: ['NOMINAL TERKECIL'] },
    // Twelve detail lines: taller than any row in a real statement, and the
    // only way to push a BCA description past the 500-character contract limit.
    { date: '12/05', keterangan: 'TRSF E-BANKING DB', amount: -2_400_000, detail: Array.from({ length: 12 }, (_, i) => `PEMBAYARAN GABUNGAN LINTAS SUPPLIER BAGIAN ${i + 1}`) },
    { date: '13/05', keterangan: 'BI-FAST CR', amount: +875_000, detail: ['BIF TRANSFER DR', '562', 'BARIS VALID TERAKHIR'], showSaldo: true },
  ],
);

// 5 — a period with no activity: header, SALDO AWAL and the totals block only.
write('05-bca-april-2026-kosong.pdf', { period: 'APRIL 2026', opening: 750_000, openingDate: '01/04' }, []);

// 6 — the year boundary: a December row on a January statement must be dated to
// the *previous* year, since BCA prints no year on the row itself.
write(
  '06-bca-januari-2027-lintas-tahun.pdf',
  { period: 'JANUARI 2027', opening: 2_000_000, openingDate: '31/12' },
  [
    { date: '31/12', keterangan: 'TRANSAKSI DEBIT', amount: -75_000, detail: ['TGL: 31/12', 'QR 014', '00000.00SUPERINDO'] },
    { date: '01/01', keterangan: 'BI-FAST CR', amount: +500_000, detail: ['BIF TRANSFER DR', '562', 'SETORAN AWAL TAHUN'] },
    { date: '15/01', keterangan: 'BIAYA ADM', amount: -10_000, cbg: '0998', showSaldo: true },
  ],
);
