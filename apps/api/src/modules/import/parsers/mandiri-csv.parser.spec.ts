import { MandiriCsvParser } from './mandiri-csv.parser';
import { TransactionType } from '../../../generated/prisma/enums';

describe('MandiriCsvParser', () => {
  let parser: MandiriCsvParser;

  beforeEach(() => {
    parser = new MandiriCsvParser();
  });

  it('parses inflow column as INFLOW and outflow column as OUTFLOW', async () => {
    const csv = [
      '01/08/2026,SETORAN TUNAI,REF123,500000.00,0.00',
      '02/08/2026,PEMBAYARAN LISTRIK,REF456,0.00,150000.00',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      amount: '500000.00',
      type: TransactionType.INFLOW,
      description: 'SETORAN TUNAI',
      externalRef: 'REF123',
      dedupHash: null,
    });

    expect(result[1]).toMatchObject({
      amount: '150000.00',
      type: TransactionType.OUTFLOW,
      description: 'PEMBAYARAN LISTRIK',
      externalRef: 'REF456',
      dedupHash: null,
    });
  });

  it('generates unique dedupHashes for identical rows without externalRef', async () => {
    const csv = [
      '05/08/2026,SETORAN TUNAI,,300000.00,0.00',
      '05/08/2026,SETORAN TUNAI,,300000.00,0.00',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(2);
    expect(result[0].externalRef).toBeNull();
    expect(result[1].externalRef).toBeNull();
    expect(result[0].dedupHash).toBeDefined();
    expect(result[1].dedupHash).toBeDefined();
    expect(result[0].dedupHash).not.toBe(result[1].dedupHash);
  });

  it('rejects negative and zero amounts', async () => {
    const csv = [
      '01/08/2026,NEGATIVE INFLOW,REF001,-50000.00,0.00',
      '02/08/2026,NEGATIVE OUTFLOW,REF002,0.00,-100000.00',
      '03/08/2026,ZERO BOTH,REF003,0.00,0.00',
      '04/08/2026,VALID ROW,REF004,25000.00,0.00',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('VALID ROW');
    expect(result[0].amount).toBe('25000.00');
  });

  it('handles formatted amounts with thousands commas', async () => {
    const csv = ['10/08/2026,GAJI MASUK,REF999,"15,500,000.00",0.00'].join(
      '\n',
    );

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe('15500000.00');
    expect(result[0].type).toBe(TransactionType.INFLOW);
  });

  it('ignores headers, empty lines, and malformed dates', async () => {
    const csv = [
      'Date,Description,Reference,Debit,Credit',
      '',
      'invalid-date,TEST,REF01,10000.00,0.00',
      '32/01/2026,BAD DAY,REF02,10000.00,0.00',
      '10/08/2026,GOOD ROW,REF03,10000.00,0.00',
    ].join('\n');

    const result = await parser.parse(Buffer.from(csv));

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('GOOD ROW');
  });
});
