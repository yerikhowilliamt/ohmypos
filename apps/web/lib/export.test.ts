import { describe, expect, it } from 'vitest';
import { buildWorkbook, type ExportColumn } from './export';

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
