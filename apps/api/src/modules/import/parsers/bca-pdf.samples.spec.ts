import * as fs from 'fs';
import * as path from 'path';
import { BcaPdfParser } from './bca-pdf.parser';
import { TransactionType } from '../../../generated/prisma/enums';

/**
 * End-to-end checks against the synthetic sample statements in
 * `docs/e-statements`, which are laid out on the same geometry as a real BCA
 * statement (see `gen-bca-pdf.js`). The unit spec exercises the column slicing
 * on hand-built text items; this one proves the whole path — pdfjs extraction,
 * period detection, row grouping, parsing — still holds on real PDF bytes.
 *
 * Regenerate the fixtures with:
 *   node docs/e-statements/make-bca-statements.js docs/e-statements
 */
const SAMPLES = path.resolve(__dirname, '../../../../../../docs/e-statements');

const parser = new BcaPdfParser();
const read = (name: string) =>
  parser.parse(fs.readFileSync(path.join(SAMPLES, name)));

const totalOf = (
  rows: Awaited<ReturnType<typeof read>>,
  type: TransactionType,
) =>
  rows
    .filter((entry) => entry.type === type)
    .reduce((sum, entry) => sum + Number(entry.amount), 0)
    .toFixed(2);

jest.setTimeout(30000);

it('parses a single-page statement, skipping only the SALDO AWAL row', async () => {
  const rows = await read('01-bca-juli-2026-normal.pdf');

  expect(rows).toHaveLength(9);
  expect(totalOf(rows, TransactionType.INFLOW)).toBe('1806204.11');
  expect(totalOf(rows, TransactionType.OUTFLOW)).toBe('473500.00');
  // A single-line last row sits only ~44pt above the closing totals block.
  expect(rows[rows.length - 1].description).toBe('BUNGA 0998');
});

it('flattens rows across pages and drops the repeated header and footer', async () => {
  const rows = await read('02-bca-agustus-2026-multipage.pdf');

  expect(rows).toHaveLength(30);
  expect(rows.filter((e) => e.type === TransactionType.OUTFLOW)).toHaveLength(
    10,
  );
  expect(rows.every((e) => e.txnDate.getUTCMonth() === 7)).toBe(true);

  // No description may carry text from the header, the carry-over footer or
  // the closing totals block — all of which repeat on every page.
  const furniture = [
    'REKENING TAHAPAN',
    'HALAMAN',
    'PERIODE',
    'TANGGAL KETERANGAN',
    'Bersambung',
    'MUTASI CR',
    'SALDO AKHIR',
  ];
  for (const entry of rows) {
    for (const noise of furniture) {
      expect(entry.description).not.toContain(noise);
    }
  }
});

it('gives byte-identical rows distinct dedup hashes', async () => {
  const rows = await read('03-bca-juni-2026-duplikat.pdf');

  expect(rows).toHaveLength(6);
  expect(new Set(rows.map((e) => e.dedupHash)).size).toBe(6);
});

it('skips malformed rows and keeps the valid ones around them', async () => {
  const rows = await read('04-bca-mei-2026-edge-cases.pdf');

  expect(rows).toHaveLength(5);
  expect(rows.map((e) => e.amount)).toEqual([
    '1500000.00',
    '125750000.00',
    '1.00',
    '2400000.00',
    '875000.00',
  ]);
  expect(rows.some((e) => e.description.includes('DILEWATI'))).toBe(false);
  expect(rows[3].description).toHaveLength(500);
});

it('returns nothing, and does not throw, for a period with no activity', async () => {
  await expect(read('05-bca-april-2026-kosong.pdf')).resolves.toEqual([]);
});

it('dates a December row on a January statement to the previous year', async () => {
  const rows = await read('06-bca-januari-2027-lintas-tahun.pdf');

  expect(rows.map((e) => e.txnDate.toISOString().slice(0, 10))).toEqual([
    '2026-12-31',
    '2027-01-01',
    '2027-01-15',
  ]);
});
