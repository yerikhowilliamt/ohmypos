import { describe, expect, it } from 'vitest';
import { buildWorkbook, rangeSuffix, type ExportColumn } from './export';

interface Row {
  name: string;
  amount: number;
  date: Date;
}

const columns: ExportColumn<Row>[] = [
  { header: 'Nama', accessor: (row) => row.name },
  { header: 'Jumlah', accessor: (row) => row.amount },
  { header: 'Tanggal', accessor: (row) => row.date },
];

const rows: Row[] = [
  { name: 'Kopi Susu', amount: 15000, date: new Date('2026-08-01') },
  { name: 'Teh Manis', amount: 8000, date: new Date('2026-08-02') },
];

describe('buildWorkbook', () => {
  it('writes a bold header row matching the column headers', async () => {
    const workbook = await buildWorkbook(columns, rows, 'Sheet1');
    const sheet = workbook.getWorksheet('Sheet1');
    const headerRow = sheet?.getRow(1);

    expect(headerRow?.getCell(1).value).toBe('Nama');
    expect(headerRow?.getCell(2).value).toBe('Jumlah');
    expect(headerRow?.getCell(3).value).toBe('Tanggal');
    expect(headerRow?.font).toEqual({ bold: true });
  });

  it('writes each row with native (non-stringified) cell types', async () => {
    const workbook = await buildWorkbook(columns, rows, 'Sheet1');
    const sheet = workbook.getWorksheet('Sheet1');

    const firstDataRow = sheet?.getRow(2);
    expect(firstDataRow?.getCell(1).value).toBe('Kopi Susu');
    expect(firstDataRow?.getCell(2).value).toBe(15000);
    expect(firstDataRow?.getCell(3).value).toBeInstanceOf(Date);

    const secondDataRow = sheet?.getRow(3);
    expect(secondDataRow?.getCell(1).value).toBe('Teh Manis');
    expect(secondDataRow?.getCell(2).value).toBe(8000);
  });

  it('produces an empty sheet (header only) when there are no rows', async () => {
    const workbook = await buildWorkbook(columns, [], 'Sheet1');
    const sheet = workbook.getWorksheet('Sheet1');

    expect(sheet?.rowCount).toBe(1);
  });
});

/**
 * DEBT-025: the filename is the only period label the person who opens the
 * file later has — they do not have the screen it was exported from.
 */
describe('rangeSuffix', () => {
  it('names a multi-day range by both ends', () => {
    expect(rangeSuffix('2026-01-01', '2026-01-31')).toBe(
      '2026-01-01_sd_2026-01-31',
    );
  });

  it('collapses a single-day range to one date', () => {
    expect(rangeSuffix('2026-01-05', '2026-01-05')).toBe('2026-01-05');
  });

  it('falls back to the LOCAL date, not the UTC one', () => {
    // toISOString() would give the UTC date: in WIB (UTC+7) every export
    // between 00:00 and 07:00 would be named with yesterday's date. Caught in
    // the TASK-073 browser verification, which ran at 04:00 local.
    expect(rangeSuffix()).toBe(new Date().toLocaleDateString('sv-SE'));
  });

  it('falls back to today when no range is given', () => {
    // Correct for data that IS a state of today (payables, bank transactions)
    // rather than a range.
    expect(rangeSuffix()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rangeSuffix('2026-01-01', undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('distinguishes two different ranges exported on the same day', () => {
    // The whole defect: both used to be `<report>_<today>.xlsx`, so the second
    // download silently overwrote the first.
    expect(rangeSuffix('2026-01-01', '2026-01-31')).not.toBe(
      rangeSuffix('2026-02-01', '2026-02-28'),
    );
  });
});
