/**
 * Generates synthetic BCA "Laporan Mutasi Rekening" e-Statement PDFs whose text
 * runs land on the exact column x-positions BcaPdfParser slices by
 * (TANGGAL 40-85, KETERANGAN 85-190, detail 190-305, CBG 305-370,
 * MUTASI 370-440, DB flag 440-460, SALDO >=460).
 *
 * The geometry here is measured from a real 7-page August statement, not
 * invented: rows are variable-height (one line for a fee, five for a wallet
 * top-up), detail lines hang 12.1pt apart *below* the date marker, and the next
 * row's marker sits 14.1pt below the previous row's last line. The parser keys
 * rows off the date marker for exactly that reason, so a fixed pitch here would
 * not exercise it honestly.
 *
 * Reuses `buildPdf` from the Mandiri generator — no new dependency.
 */
const { buildPdf } = require('./gen-mandiri-pdf');

// ---------------------------------------------------------------- geometry

const FONT_SIZE = 7;

/** Helvetica advance widths, in em, for the glyphs the amount columns use. */
const GLYPH_EM = { digit: 0.556, comma: 0.278, period: 0.278, space: 0.278 };

/** Width of a rendered amount, used to right-align the MUTASI/SALDO columns. */
function amountWidth(text, size = FONT_SIZE) {
  let em = 0;
  for (const char of text) {
    if (char >= '0' && char <= '9') em += GLYPH_EM.digit;
    else if (char === ',') em += GLYPH_EM.comma;
    else if (char === '.') em += GLYPH_EM.period;
    else em += GLYPH_EM.space;
  }
  return em * size;
}

const X = {
  date: 43,
  keterangan: 88.7,
  detail: 194.3,
  cbg: 308.1,
  /** MUTASI and SALDO are right-aligned; these are the right edges. */
  mutasiEnd: 436.7,
  flag: 442.0,
  saldoEnd: 569.0,
};

const FIRST_ROW_Y = 576.0;
/** Spacing between the detail lines inside one row. */
const LINE_PITCH = 12.1;
/** Spacing between a row's last line and the next row's date marker. */
const ROW_GAP = 14.1;
/** Rows stop before this y so the page footer never collides with one. */
const MIN_ROW_Y = 120;

// ---------------------------------------------------------------- formatting

/** 469033.88 -> "469,033.88" — BCA groups with commas and uses a dot decimal. */
const bca = (n) => {
  const [whole, cents] = Math.abs(n).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
};

// ---------------------------------------------------------------- page furniture

/** Spaces out a string the way BCA renders its letter-spaced legal text. */
const spaced = (s) => s.split('').join(' ');

function header({ holder, account, period, pageNo, pageCount }) {
  return [
    { x: 167.3, y: 795.8, str: 'REKENING TAHAPAN XPRESI' },
    { x: 30.0, y: 774.1, str: spaced('KCP URIP SUMOHARJO') },
    { x: 31.0, y: 754.4, str: holder },
    { x: 324.4, y: 755.4, str: 'NO. REKENING' },
    { x: 416.8, y: 755.4, str: ':' },
    { x: 435.3, y: 755.4, str: account },
    { x: 31.0, y: 742.3, str: 'JEBRES' },
    { x: 324.4, y: 739.3, str: 'HALAMAN' },
    { x: 416.8, y: 739.3, str: ':' },
    { x: 435.6, y: 739.8, str: `${pageNo}` },
    { x: 441.5, y: 739.8, str: '/' },
    { x: 446.7, y: 739.8, str: `${pageCount}` },
    { x: 31.0, y: 730.2, str: 'RT001 RW003 JAWA TENGAH' },
    { x: 324.4, y: 723.2, str: 'PERIODE' },
    { x: 416.8, y: 723.2, str: ':' },
    { x: 435.3, y: 723.2, str: period },
    { x: 31.0, y: 718.1, str: 'TEGALREJO' },
    { x: 324.4, y: 707.1, str: 'MATA UANG' },
    { x: 416.8, y: 707.1, str: ':' },
    { x: 435.3, y: 707.1, str: 'IDR' },
    { x: 31.0, y: 705.9, str: 'SURAKARTA 57126' },
    { x: 31.0, y: 693.8, str: 'INDONESIA' },
    // Letter-spaced legal notice. Some of it lands in the CBG and MUTASI
    // columns on purpose — it sits above the first row marker, so the parser
    // must drop it on position alone, with no blocklist.
    { x: 23.0, y: 663.9, str: spaced('CATATAN :') },
    { x: 25.0, y: 649.5, str: '•' },
    { x: 34.4, y: 649.5, str: spaced('Apabila nasabah tidak melakukan sanggahan atas Laporan Mutasi') },
    { x: 296.5, y: 649.5, str: '•' },
    { x: 305.9, y: 649.5, str: spaced('BCA berhak setiap saat melakukan koreksi apabila ada kesalahan pada') },
    { x: 34.4, y: 639.1, str: spaced('Rekening ini sampai dengan akhir bulan berikutnya, nasabah dianggap') },
    { x: 305.9, y: 639.1, str: spaced('Laporan Mutasi Rekening.') },
    { x: 34.4, y: 628.8, str: spaced('telah menyetujui segala data yang tercantum pada Laporan Mutasi') },
    { x: 34.4, y: 618.4, str: spaced('Rekening ini.') },
    { x: 33.1, y: 596.7, str: 'TANGGAL' },
    { x: 163.9, y: 596.7, str: 'KETERANGAN' },
    { x: 308.0, y: 596.7, str: 'CBG' },
    { x: 380.3, y: 596.7, str: 'MUTASI' },
    { x: 500.5, y: 596.7, str: 'SALDO' },
  ];
}

const CONTINUED = { x: 400.0, y: 35.0, str: 'Bersambung ke halaman berikut' };

/**
 * The closing totals block. Its amounts sit in the CBG column and it carries no
 * date cell, so the parser must ignore it purely on geometry — the reason
 * `MAX_ROW_HEIGHT` exists in the parser.
 */
function summary({ opening, closing, creditTotal, creditCount, debitTotal, debitCount }, y) {
  const right = (text, endX, yy) => ({ x: endX - amountWidth(text), y: yy, str: text });
  const line = (label, text, count, yy) => [
    { x: 208.5, y: yy, str: label },
    { x: 265.2, y: yy, str: ':' },
    right(text, 368.2, yy),
    ...(count === undefined ? [] : [{ x: 407.2, y: yy, str: String(count) }]),
  ];
  return [
    ...line('SALDO AWAL', bca(opening), undefined, y),
    ...line('MUTASI CR', bca(creditTotal), creditCount, y - 12.1),
    ...line('MUTASI DB', bca(debitTotal), debitCount, y - 24.2),
    ...line('SALDO AKHIR', bca(closing), undefined, y - 36.3),
  ];
}

// ---------------------------------------------------------------- rows

/**
 * row: { date, keterangan, detail[], cbg, mutasi, flag, saldo } — every field
 * is a raw string so a scenario can omit or corrupt any one of them.
 * Returns the items plus the y the next row's marker should sit at.
 */
function rowItems(row, y) {
  const items = [];
  if (row.date != null) items.push({ x: X.date, y, str: row.date });
  if (row.keterangan) items.push({ x: X.keterangan, y, str: row.keterangan });
  if (row.cbg) items.push({ x: X.cbg, y, str: row.cbg });
  if (row.mutasi != null) {
    items.push({ x: X.mutasiEnd - amountWidth(row.mutasi), y, str: row.mutasi });
  }
  if (row.flag) items.push({ x: X.flag, y, str: row.flag });
  if (row.saldo != null) {
    items.push({ x: X.saldoEnd - amountWidth(row.saldo), y, str: row.saldo });
  }
  (row.detail ?? []).forEach((line, index) => {
    items.push({ x: X.detail, y: y - index * LINE_PITCH, str: line });
  });

  const lines = Math.max(row.detail?.length ?? 0, 1);
  return { items, nextY: y - (lines - 1) * LINE_PITCH - ROW_GAP };
}

/** Splits rows across pages, packing until the next one would cross MIN_ROW_Y. */
function paginate(rows) {
  const pages = [];
  let page = [];
  let y = FIRST_ROW_Y;

  for (const row of rows) {
    const { items, nextY } = rowItems(row, y);
    if (nextY < MIN_ROW_Y && page.length > 0) {
      pages.push(page);
      page = [];
      y = FIRST_ROW_Y;
      const restarted = rowItems(row, y);
      page.push(...restarted.items);
      y = restarted.nextY;
      continue;
    }
    page.push(...items);
    y = nextY;
  }

  pages.push(page);
  return { pages, lastY: y };
}

function buildStatement(meta, rows) {
  const { pages: rowPages, lastY } = paginate(rows);

  // The totals block goes on the last page when it fits below the final row,
  // otherwise on a page of its own — the same thing a real statement does.
  // The 30pt offset is measured from the real August statement, and it is
  // deliberately tight: after a single-line last row the block lands only ~44pt
  // below that row's marker, inside the parser's `MAX_ROW_HEIGHT`. That is the
  // case the parser's trailer floor exists for, so the samples must produce it.
  const summaryY = lastY - 30;
  const needsOwnPage = summaryY < 90;
  const pageCount = rowPages.length + (needsOwnPage ? 1 : 0);

  const pages = rowPages.map((items, index) => {
    const isLast = index === rowPages.length - 1 && !needsOwnPage;
    return [
      ...header({ ...meta, pageNo: index + 1, pageCount }),
      ...items,
      ...(isLast ? summary(meta, summaryY) : [CONTINUED]),
    ];
  });

  if (needsOwnPage) {
    pages.push([
      ...header({ ...meta, pageNo: pageCount, pageCount }),
      ...summary(meta, FIRST_ROW_Y),
    ]);
  }

  return buildPdf(pages.map((items) => items.map((i) => ({ size: FONT_SIZE, ...i }))));
}

/**
 * Builds statement rows from compact entries, keeping a running balance and the
 * CR/DB totals the summary block prints.
 *
 * Every statement opens with a `SALDO AWAL` row that carries a date and a
 * balance but no MUTASI amount — the parser must skip it, and it does so
 * because it skips every amount-less row, not by name.
 */
function ledger(opening, openingDate, entries) {
  let balance = opening;
  let creditTotal = 0;
  let debitTotal = 0;
  let creditCount = 0;
  let debitCount = 0;

  const rows = [
    { date: openingDate, keterangan: 'SALDO AWAL', detail: [], mutasi: null, flag: '', saldo: bca(opening) },
  ];

  for (const entry of entries) {
    const signed = entry.amount ?? 0;
    const isDebit = entry.flag !== undefined ? entry.flag === 'DB' : signed < 0;

    if (entry.countInSummary !== false) {
      balance += signed;
      if (signed >= 0) {
        creditTotal += signed;
        creditCount += 1;
      } else {
        debitTotal += -signed;
        debitCount += 1;
      }
    }

    rows.push({
      date: entry.date,
      keterangan: entry.keterangan,
      detail: entry.detail ?? [],
      cbg: entry.cbg,
      mutasi: entry.mutasi !== undefined ? entry.mutasi : bca(Math.abs(signed)),
      flag: entry.flag !== undefined ? entry.flag : isDebit ? 'DB' : '',
      // Real statements print the running balance only intermittently.
      saldo: entry.saldo !== undefined ? entry.saldo : entry.showSaldo ? bca(balance) : null,
    });
  }

  return {
    rows,
    totals: { opening, closing: balance, creditTotal, creditCount, debitTotal, debitCount },
  };
}

module.exports = { buildStatement, ledger, bca, amountWidth, X, FIRST_ROW_Y };
