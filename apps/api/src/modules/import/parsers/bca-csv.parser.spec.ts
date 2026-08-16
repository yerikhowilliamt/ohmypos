import { BcaCsvParser } from './bca-csv.parser';
import { TransactionType } from '../../../generated/prisma/enums';

describe('BcaCsvParser', () => {
  let parser: BcaCsvParser;

  beforeEach(() => {
    parser = new BcaCsvParser();
  });

  it('parses valid CR as INFLOW and DB as OUTFLOW', async () => {
    const csv = [
      '01/08/2026,SETORAN TUNAI,0000,500000.00,CR',
      '02/08/2026,TARIK TUNAI,0000,200000.00,DB',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      amount: '500000.00',
      type: TransactionType.INFLOW,
      description: 'SETORAN TUNAI',
      externalRef: null,
    });
    expect(result[0].txnDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');

    expect(result[1]).toMatchObject({
      amount: '200000.00',
      type: TransactionType.OUTFLOW,
      description: 'TARIK TUNAI',
    });
    expect(result[1].txnDate.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('rejects unrecognised type codes (CREDIT, DEBIT, empty, garbage) (DEF-003)', async () => {
    const csv = [
      '03/08/2026,GAJI MASUK,0000,7000000.00,CREDIT',
      '04/08/2026,ENTRI KOSONG,0000,250000.00,',
      '05/08/2026,GARBAGE CODE,0000,100000.00,XYZ',
      '06/08/2026,VALID ROW,0000,150000.00,CR',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('VALID ROW');
    expect(result[0].type).toBe(TransactionType.INFLOW);
  });

  it('rejects negative and zero amounts (DEF-005)', async () => {
    const csv = [
      '01/08/2026,NEGATIVE ROW,0000,-900000.00,CR',
      '02/08/2026,ZERO ROW,0000,0.00,DB',
      '03/08/2026,NOT A NUMBER,0000,abc,CR',
      '04/08/2026,VALID ROW,0000,50000.00,CR',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('VALID ROW');
    expect(result[0].amount).toBe('50000.00');
  });

  it('preserves multiple identical same-day deposits via distinct dedupHashes (DEF-004)', async () => {
    const csv = [
      '02/08/2026,SETORAN TUNAI,0000,500000.00,CR',
      '02/08/2026,SETORAN TUNAI,0000,500000.00,CR',
      '02/08/2026,SETORAN TUNAI,0000,500000.00,CR',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(3);
    const hashes = result.map((r) => r.dedupHash);
    // All three hashes must be non-null and mutually distinct
    expect(new Set(hashes).size).toBe(3);
    hashes.forEach((h) => expect(h).toBeDefined());
  });

  it('handles formatted amounts with thousands commas and branch codes', async () => {
    const csv = ['15/08/2026,TRANSFER DARI KLIEN,1234,"1,250,000.50",CR'].join(
      '\n',
    );

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe('1250000.50');
    expect(result[0].description).toBe('TRANSFER DARI KLIEN - 1234');
    expect(result[0].type).toBe(TransactionType.INFLOW);
  });

  it('handles case-insensitivity and whitespace in type column', async () => {
    const csv = [
      '10/08/2026,ROW LOWERCASE CR,0000,10000.00, cr ',
      '11/08/2026,ROW LOWERCASE DB,0000,20000.00, db ',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe(TransactionType.INFLOW);
    expect(result[1].type).toBe(TransactionType.OUTFLOW);
  });

  it('ignores headers, empty lines, and malformed dates', async () => {
    const csv = [
      'Tanggal,Keterangan,Cabang,Jumlah,Tipe',
      '',
      'invalid-date,TEST,0000,10000.00,CR',
      '32/01/2026,BAD DAY,0000,10000.00,CR',
      '01/13/2026,BAD MONTH,0000,10000.00,CR',
      '30/02/2026,INVALID FEB 30,0000,10000.00,CR',
      '10/08/2026,GOOD ROW,0000,10000.00,CR',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('GOOD ROW');
  });
});
