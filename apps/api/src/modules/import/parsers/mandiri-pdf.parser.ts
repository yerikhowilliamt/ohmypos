import * as crypto from 'crypto';
import Decimal from 'decimal.js';
import { TransactionType } from '../../../generated/prisma/enums';
import {
  BankParser,
  ParsedTransaction,
} from '../interfaces/bank-parser.interface';
import { extractPdfPages, PdfTextItem } from './pdf-text.util';

/**
 * Column x-ranges of the Mandiri e-Statement transaction table, in PDF points.
 * The layout is a fixed grid — `No` at x=20, date/time at x=52, description at
 * x=124, with `Nominal` and `Saldo` right-aligned — so slicing by column is far
 * more reliable than regexing a flattened line. Verified against a 6-page,
 * 57-transaction statement: every row extracted, and the running balance
 * reconciles from the opening to the closing balance.
 */
const COLUMN = {
  no: (x: number) => x < 40,
  date: (x: number) => x >= 40 && x < 120,
  description: (x: number) => x >= 120 && x < 370,
  nominal: (x: number) => x >= 370 && x < 460,
  saldo: (x: number) => x >= 460,
};

/**
 * How far above/below its `No` marker a row's cells may sit. Rows are ~46pt
 * apart and the tallest observed row spans ~30pt, so this both captures a full
 * row and keeps the page header out of the first row's description.
 */
const MAX_ROW_HALF_HEIGHT = 25;

/** Mandiri renders month abbreviations in either language depending on locale. */
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
};

const DATE_PATTERN = /^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/;
const TIME_PATTERN = /^(\d{2}:\d{2}:\d{2})/;
const AMOUNT_PATTERN = /^([+-])\s*([\d.]+,\d{2})$/;

/** Matches `CreateBankTransactionSchema.description` (max 500). */
const MAX_DESCRIPTION_LENGTH = 500;

/** One transaction row, still as raw strings straight off the page. */
export interface MandiriPdfRow {
  no: number;
  date: string | null;
  time: string | null;
  description: string;
  nominal: string | null;
}

/**
 * Groups a page's text runs into rows, keyed off the sequential `No` marker in
 * the leftmost column. Each row claims the runs between the midpoints to its
 * neighbours, so page furniture (header, column titles, footer) and the
 * disclaimer page fall outside every row and are dropped without a blocklist.
 */
export function extractMandiriRows(items: PdfTextItem[]): MandiriPdfRow[] {
  const markers = items
    .filter((item) => COLUMN.no(item.x) && /^\d{1,4}$/.test(item.str))
    .sort((a, b) => b.y - a.y);

  return markers.map((marker, index) => {
    const previous = markers[index - 1];
    const next = markers[index + 1];

    // PDF y grows upward, so the previous row sits at a higher y.
    const upper = previous
      ? Math.min((previous.y + marker.y) / 2, marker.y + MAX_ROW_HALF_HEIGHT)
      : marker.y + MAX_ROW_HALF_HEIGHT;
    const lower = next
      ? Math.max((next.y + marker.y) / 2, marker.y - MAX_ROW_HALF_HEIGHT)
      : marker.y - MAX_ROW_HALF_HEIGHT;

    const own = items.filter((item) => item.y < upper && item.y > lower);
    const column = (test: (x: number) => boolean) =>
      own.filter((item) => test(item.x)).sort((a, b) => b.y - a.y);

    const dateCell = column(COLUMN.date);

    return {
      no: Number(marker.str),
      date: dateCell.find((item) => DATE_PATTERN.test(item.str))?.str ?? null,
      time: dateCell.find((item) => TIME_PATTERN.test(item.str))?.str ?? null,
      description: column(COLUMN.description)
        .map((item) => item.str)
        .join(' '),
      nominal: column(COLUMN.nominal)[0]?.str ?? null,
    };
  });
}

/** `+1.099.500,00` → a positive Decimal plus its direction, or null if unusable. */
function parseAmount(
  raw: string,
): { amount: Decimal; type: TransactionType } | null {
  const match = AMOUNT_PATTERN.exec(raw.replace(/\s+/g, ' ').trim());
  if (!match) return null;

  const [, sign, digits] = match;
  // Indonesian formatting: dots group thousands, the comma is the decimal point.
  const normalised = digits.replace(/\./g, '').replace(',', '.');

  try {
    const amount = new Decimal(normalised);
    if (amount.isNaN() || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      return null;
    }
    return {
      amount,
      type: sign === '+' ? TransactionType.INFLOW : TransactionType.OUTFLOW,
    };
  } catch {
    return null;
  }
}

/** `01 Jul 2026` → midnight UTC, or null if the date is not a real calendar day. */
function parseDate(raw: string): Date | null {
  const match = DATE_PATTERN.exec(raw);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw] = match;
  const month = MONTHS[monthRaw.toLowerCase()];
  if (!month) return null;

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Turns extracted rows into transactions. Malformed rows are skipped rather
 * than guessed at — the same posture as the CSV parsers, and the safe one for
 * money: a dropped row surfaces as an unreconciled gap, a wrong one does not.
 */
export function parseMandiriRows(rows: MandiriPdfRow[]): ParsedTransaction[] {
  const parsed: ParsedTransaction[] = [];
  const signatureCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.date || !row.nominal) continue;

    const txnDate = parseDate(row.date);
    if (!txnDate) continue;

    const money = parseAmount(row.nominal);
    if (!money) continue;

    const description = row.description
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH);
    if (description === '') continue;

    const amount = money.amount.toFixed(2);
    const time = row.time ?? '';

    // The clock time is kept out of `txnDate` (day-only, matching the CSV
    // parsers and the matching engine) but folded into the hash, where it makes
    // same-day rows distinct. `no` is deliberately excluded: it restarts at 1
    // in every statement, so including it would give the same transaction a
    // different hash on an overlapping re-import and defeat the
    // (accountId, dedupHash) unique constraint.
    const baseSignature = `${txnDate.toISOString()}_${time}_${description}_${amount}_${money.type}`;
    const count = signatureCounts.get(baseSignature) ?? 0;
    signatureCounts.set(baseSignature, count + 1);

    const dedupHash = crypto
      .createHash('sha256')
      .update(count === 0 ? baseSignature : `${baseSignature}_${count}`)
      .digest('hex');

    parsed.push({
      txnDate,
      amount,
      type: money.type,
      description,
      // Reference numbers are embedded in the description text, with no column
      // of their own, so there is nothing dependable to key on.
      externalRef: null,
      dedupHash,
    });
  }

  return parsed;
}

/**
 * Parses a Mandiri Livin e-Statement PDF (PRD §5.7).
 *
 * Supports password-protected statements via `options.password`.
 */
export class MandiriPdfParser implements BankParser {
  async parse(
    fileBuffer: Buffer,
    options?: { password?: string },
  ): Promise<ParsedTransaction[]> {
    const pages = await extractPdfPages(fileBuffer, options);
    return parseMandiriRows(pages.flatMap(extractMandiriRows));
  }
}
