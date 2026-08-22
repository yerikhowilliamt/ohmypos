/**
 * Generates synthetic Mandiri Livin e-Statement PDFs whose text runs land on the
 * exact column x-positions MandiriPdfParser slices by (No <40, date 40-120,
 * description 120-370, nominal 370-460, saldo >=460), rows ~46pt apart.
 *
 * Writes raw PDF bytes directly — no new dependency.
 */
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** items: [{x, y, str, size?}] -> one page content stream */
function contentStream(items) {
  return items
    .map((i) => `BT /F1 ${i.size ?? 7} Tf 1 0 0 1 ${i.x} ${i.y} Tm (${esc(i.str)}) Tj ET`)
    .join('\n');
}

function buildPdf(pages) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  // Reserve 1 = catalog, 2 = pages tree.
  objects.push(null, null);
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const pageIds = [];
  for (const items of pages) {
    const stream = contentStream(items);
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ));
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// ---------------------------------------------------------------- statement layout

const idr = (n) => {
  const [whole, cents] = Math.abs(n).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${grouped},${cents}`;
};

const FIRST_ROW_Y = 492;
const ROW_PITCH = 46;
const ROWS_PER_PAGE = 9;

function header({ holder, account, period, pageNo, pageCount, opening, closing }) {
  return [
    { x: 16, y: 780, str: 'e-Statement', size: 12 },
    { x: 123, y: 770, str: 'Menara Mandiri 1 Jalan Jenderal Sudirman Kav. 54-55, Jakarta 12190, Indonesia', size: 6 },
    { x: 123, y: 750, str: 'Nama Pemilik Rekening' },
    { x: 123, y: 736, str: holder },
    { x: 340, y: 750, str: 'Periode Transaksi' },
    { x: 340, y: 736, str: period },
    { x: 123, y: 661, str: 'Nomor Rekening' },
    { x: 160, y: 647, str: account },
    { x: 470, y: 681, str: 'Saldo Awal' },
    { x: 527, y: 667, str: idr(opening) },
    { x: 470, y: 658, str: 'Saldo Akhir' },
    { x: 503, y: 644, str: `+ ${idr(closing)}` },
    { x: 542, y: 726, str: `${pageNo} of ${pageCount}` },
    { x: 20, y: 540, str: 'No' },
    { x: 52, y: 540, str: 'Tanggal' },
    { x: 124, y: 540, str: 'Keterangan' },
    { x: 380, y: 540, str: 'Nominal (IDR)' },
    { x: 529, y: 540, str: 'Saldo (IDR)' },
  ];
}

const FOOTER = [
  { x: 16, y: 60, str: 'PT Bank Mandiri (Persero) Tbk. berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia (BI),', size: 6 },
  { x: 16, y: 52, str: 'serta merupakan peserta penjaminan LPS.', size: 6 },
  { x: 520, y: 60, str: 'Mandiri Call 14000', size: 6 },
];

const DISCLAIMER_PAGE = [
  { x: 16, y: 780, str: 'Disclaimer', size: 12 },
  { x: 16, y: 750, str: 'Rekening Koran ini dicetak secara otomatis oleh sistem dan tidak memerlukan tanda tangan.', size: 7 },
  { x: 16, y: 736, str: 'Apabila terdapat ketidaksesuaian, harap segera menghubungi Mandiri Call 14000.', size: 7 },
  ...FOOTER,
];

/** row: {date, time, description[], nominal, saldo} — any field may be omitted to make it malformed. */
function rowItems(row, no, y) {
  const items = [{ x: 20, y, str: String(no) }];
  if (row.date != null) items.push({ x: 52, y: y + 4, str: row.date });
  if (row.time != null) items.push({ x: 52, y: y - 5, str: row.time });
  (row.description ?? []).forEach((line, index) => {
    items.push({ x: 124, y: y + 10 - index * 10, str: line, size: 6.5 });
  });
  if (row.nominal != null) items.push({ x: 390, y, str: row.nominal });
  if (row.saldo != null) items.push({ x: 531, y, str: row.saldo });
  return items;
}

function buildStatement(meta, rows, { disclaimer = true } = {}) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const pageCount = chunks.length + (disclaimer ? 1 : 0);
  const pages = chunks.map((chunk, pageIndex) => [
    ...header({ ...meta, pageNo: pageIndex + 1, pageCount }),
    ...chunk.flatMap((row, rowIndex) =>
      rowItems(row, pageIndex * ROWS_PER_PAGE + rowIndex + 1, FIRST_ROW_Y - rowIndex * ROW_PITCH),
    ),
    ...FOOTER,
  ]);

  if (disclaimer) pages.push(DISCLAIMER_PAGE);
  return buildPdf(pages);
}

/** Builds rows from compact tuples and keeps a running balance. */
function ledger(opening, entries) {
  let balance = opening;
  const rows = entries.map((entry) => {
    const signed = entry.amount ?? 0;
    balance += signed;
    return {
      date: entry.date,
      time: entry.time ?? '10:15:00 WIB',
      description: entry.description,
      nominal: entry.nominal ?? `${signed >= 0 ? '+' : '-'}${idr(Math.abs(signed))}`,
      saldo: entry.saldo ?? idr(balance),
    };
  });
  return { rows, closing: balance };
}

module.exports = { buildStatement, ledger, idr, buildPdf, DISCLAIMER_PAGE, FOOTER, header, rowItems };
