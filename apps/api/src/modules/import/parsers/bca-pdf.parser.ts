import * as crypto from 'crypto';
import Decimal from 'decimal.js';
import { TransactionType } from '../../../generated/prisma/enums';
import {
  BankParser,
  ParsedTransaction,
} from '../interfaces/bank-parser.interface';
import { extractPdfPages, PdfTextItem } from './pdf-text.util';

/**
 * Column x-ranges of the BCA "Laporan Mutasi Rekening" table, in PDF points.
 * Verified against a 7-page, 63-transaction August statement: every row
 * extracted, and the parsed CR/DB totals reconcile exactly with the statement's
 * own `MUTASI CR` / `MUTASI DB` summary block.
 *
 * BCA's grid differs from Mandiri's in three ways that shape the code below:
 * there is no row-number column to key rows off, the direction lives in a
 * one-word `DB` marker rather than a sign on the amount, and the date cell
 * carries no year.
 */
const COLUMN = {
  date: (x: number) => x >= 40 && x < 85,
  /** The transaction-type line, e.g. `TRSF E-BANKING DB`. Always one line. */
  keterangan: (x: number) => x >= 85 && x < 190,
  /** Free-text detail, up to five lines hanging below the date marker. */
  detail: (x: number) => x >= 190 && x < 305,
  cbg: (x: number) => x >= 305 && x < 370,
  mutasi: (x: number) => x >= 370 && x < 440,
  /** Holds the literal `DB` on outflows and nothing at all on inflows. */
  flag: (x: number) => x >= 440 && x < 460,
};

/**
 * How far below its date marker the *last* row on a page may reach.
 *
 * Unlike Mandiri's fixed-pitch grid, a BCA row is as tall as its detail text —
 * one line for `BIAYA ADM`, five for a GoPay top-up — so a row claims
 * everything down to the next date marker, with no cap: the next marker is the
 * true boundary, and clamping short of it truncates tall rows. Only the last
 * row on a page has no marker beneath it, and 60pt comfortably clears the
 * tallest observed row (48.5pt).
 */
const MAX_ROW_HEIGHT = 60;

/**
 * Labels of the closing totals block that follows the last row of the final
 * page. Its amounts are right-aligned into the CBG column and its transaction
 * counts into the MUTASI column, so a last row that swallowed it would gain a
 * junk branch code — or, on an amount-less row, an invented amount.
 *
 * `MAX_ROW_HEIGHT` alone does not keep it out: the block sits ~68pt below the
 * marker of a three-line last row but only ~44pt below a single-line one, and
 * a fee or interest row at the foot of a statement is routinely single-line.
 * Matching the block explicitly makes the floor independent of row height.
 */
const SUMMARY_LABELS = new Set([
  'SALDO AWAL',
  'MUTASI CR',
  'MUTASI DB',
  'SALDO AKHIR',
]);

/** The carry-over footer on every page but the last. */
const CONTINUATION_PATTERN = /^Bersambung ke halaman/i;

/**
 * Smallest x at which a `SALDO AWAL` cell belongs to the totals block rather
 * than to a real opening-balance row, whose label sits in the KETERANGAN column.
 */
const SUMMARY_LABEL_MIN_X = 190;

/**
 * The y below which a page carries only trailing furniture, or null when the
 * page has none. Rows never reach past it, whatever `MAX_ROW_HEIGHT` allows.
 */
function pageTrailerY(
  items: PdfTextItem[],
  lastMarkerY: number,
): number | null {
  const trailers = items.filter(
    (item) =>
      item.y < lastMarkerY &&
      ((item.x >= SUMMARY_LABEL_MIN_X &&
        SUMMARY_LABELS.has(item.str.toUpperCase())) ||
        CONTINUATION_PATTERN.test(item.str)),
  );

  if (trailers.length === 0) return null;
  return Math.max(...trailers.map((item) => item.y));
}

/** The row's own date: day and month only — BCA prints no year on the row. */
const DATE_PATTERN = /^(\d{2})\/(\d{2})$/;

/** `205,000.00` — BCA groups thousands with commas and uses a dot decimal. */
const AMOUNT_PATTERN = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;

/** `AGUSTUS 2026` in the page header — the only place the year appears. */
const PERIOD_PATTERN = /^([A-Za-z]+)\s+(\d{4})$/;

/** The header prints the month name in full, in Indonesian. */
const MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

/** Matches `CreateBankTransactionSchema.description` (max 500). */
const MAX_DESCRIPTION_LENGTH = 500;

/** The statement period, read off the page header. */
export interface BcaPeriod {
  month: number;
  year: number;
}

/** One transaction row, still as raw strings straight off the page. */
export interface BcaPdfRow {
  date: string;
  keterangan: string;
  detail: string;
  cbg: string | null;
  mutasi: string | null;
  /** `DB` on an outflow, empty on an inflow. */
  flag: string;
}

/**
 * Reads `PERIODE : AGUSTUS 2026` off a page header.
 *
 * The label and its value are separated by a colon cell, so the value is found
 * by scanning right along the label's baseline rather than by x-range — the
 * header block is right-aligned and shifts with the account number's width.
 */
export function extractBcaPeriod(items: PdfTextItem[]): BcaPeriod | null {
  const label = items.find((item) => item.str.toUpperCase() === 'PERIODE');
  if (!label) return null;

  const value = items.find(
    (item) =>
      Math.abs(item.y - label.y) < 3 &&
      item.x > label.x &&
      PERIOD_PATTERN.test(item.str),
  );
  if (!value) return null;

  const match = PERIOD_PATTERN.exec(value.str);
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;

  return { month, year: Number(match[2]) };
}

/**
 * Groups a page's text runs into rows, keyed off the `DD/MM` cell in the date
 * column. A row owns everything from its own baseline down to the next date
 * marker, which is what makes variable-height rows work: the detail lines hang
 * below the marker, so a midpoint rule would cut a tall row in half.
 *
 * Page furniture falls out on position alone, with no blocklist: the header
 * sits above the first marker, and the footer and closing summary block sit
 * below the floor the last row is clamped to.
 */
export function extractBcaRows(items: PdfTextItem[]): BcaPdfRow[] {
  const markers = items
    .filter((item) => COLUMN.date(item.x) && DATE_PATTERN.test(item.str))
    .sort((a, b) => b.y - a.y);

  if (markers.length === 0) return [];

  const trailerY = pageTrailerY(items, markers[markers.length - 1].y);

  return markers.map((marker, index) => {
    const next = markers[index + 1];

    // PDF y grows upward: the row starts at its marker and runs downward.
    const upper = marker.y + 2;
    const lower = next
      ? next.y
      : Math.max(marker.y - MAX_ROW_HEIGHT, trailerY ?? -Infinity);

    const own = items.filter((item) => item.y < upper && item.y > lower);
    const column = (test: (x: number) => boolean) =>
      own
        .filter((item) => test(item.x))
        .sort((a, b) => b.y - a.y)
        .map((item) => item.str);

    return {
      date: marker.str,
      keterangan: column(COLUMN.keterangan).join(' '),
      detail: column(COLUMN.detail).join(' '),
      cbg: column(COLUMN.cbg)[0] ?? null,
      mutasi: column(COLUMN.mutasi)[0] ?? null,
      flag: column(COLUMN.flag).join(''),
    };
  });
}

/** `205,000.00` → a positive Decimal, or null if unusable. */
function parseAmount(raw: string): Decimal | null {
  const trimmed = raw.replace(/\s+/g, '');
  if (!AMOUNT_PATTERN.test(trimmed)) return null;

  try {
    const amount = new Decimal(trimmed.replace(/,/g, ''));
    if (amount.isNaN() || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      return null;
    }
    return amount;
  } catch {
    return null;
  }
}

/**
 * `13/08` plus the statement period → midnight UTC, or null if the row is not a
 * real calendar day or does not belong to the statement.
 *
 * A statement occasionally carries a row from the tail of the previous month
 * across a year boundary (a December row on a January statement), so that one
 * case rolls the year back. Any other month mismatch is a row this parser
 * cannot date confidently, and an undatable row is dropped rather than guessed
 * at — a missing row surfaces as an unreconciled gap, a misdated one silently
 * lands in the wrong period.
 */
function parseDate(raw: string, period: BcaPeriod): Date | null {
  const match = DATE_PATTERN.exec(raw);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  let year = period.year;
  if (month !== period.month) {
    if (month === 12 && period.month === 1) {
      year -= 1;
    } else {
      return null;
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Turns extracted rows into transactions. Malformed rows are skipped rather
 * than guessed at — the same posture as the CSV parsers and `MandiriPdfParser`.
 *
 * The `SALDO AWAL` opening-balance row needs no special case: it carries no
 * `MUTASI` amount, so it falls out with every other amount-less row.
 */
export function parseBcaRows(
  rows: BcaPdfRow[],
  period: BcaPeriod,
): ParsedTransaction[] {
  const parsed: ParsedTransaction[] = [];
  const signatureCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.mutasi) continue;

    const txnDate = parseDate(row.date, period);
    if (!txnDate) continue;

    const money = parseAmount(row.mutasi);
    if (!money) continue;

    // Direction is carried by a marker column, not by a sign: `DB` is an
    // outflow and an empty cell is an inflow. Anything else means the column
    // was misread, so the row is dropped rather than defaulted to inflow.
    const flag = row.flag.toUpperCase().trim();
    if (flag !== '' && flag !== 'DB') continue;
    const type =
      flag === 'DB' ? TransactionType.OUTFLOW : TransactionType.INFLOW;

    // `keterangan` names the transaction type, `detail` carries the
    // counterparty and reference; `cbg` is the originating branch code, kept
    // because it is the only thing distinguishing some same-day fee rows.
    const description = [row.keterangan, row.detail, row.cbg]
      .filter((part): part is string => Boolean(part && part.trim() !== ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH);
    if (description === '') continue;

    const amount = money.toFixed(2);

    // Counted duplicates keep byte-identical rows distinct without letting a
    // re-import of an overlapping statement collide, exactly as in
    // `MandiriPdfParser`. Nothing page-relative goes into the hash.
    const baseSignature = `${txnDate.toISOString()}_${description}_${amount}_${type}`;
    const count = signatureCounts.get(baseSignature) ?? 0;
    signatureCounts.set(baseSignature, count + 1);

    const dedupHash = crypto
      .createHash('sha256')
      .update(count === 0 ? baseSignature : `${baseSignature}_${count}`)
      .digest('hex');

    parsed.push({
      txnDate,
      amount,
      type,
      description,
      // Reference numbers live inside the detail text with no column of their
      // own, so there is nothing dependable to key on.
      externalRef: null,
      dedupHash,
    });
  }

  return parsed;
}

/**
 * Parses a BCA "Laporan Mutasi Rekening" e-Statement PDF (PRD §5.7, ADR-022).
 *
 * Supports password-protected statements via `options.password`.
 */
export class BcaPdfParser implements BankParser {
  async parse(
    fileBuffer: Buffer,
    options?: { password?: string },
  ): Promise<ParsedTransaction[]> {
    const pages = await extractPdfPages(fileBuffer, options);

    // Every page repeats the header, but the first one that yields a period is
    // enough — and without a year no row can be dated, so there is nothing to
    // salvage from a statement whose header is missing or unrecognised.
    let period: BcaPeriod | null = null;
    for (const page of pages) {
      period = extractBcaPeriod(page);
      if (period) break;
    }
    if (!period) return [];

    return parseBcaRows(pages.flatMap(extractBcaRows), period);
  }
}
