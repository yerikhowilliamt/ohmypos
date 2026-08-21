import {
  extractMandiriRows,
  parseMandiriRows,
  MandiriPdfRow,
} from './mandiri-pdf.parser';
import { PdfTextItem } from './pdf-text.util';
import { TransactionType } from '../../../generated/prisma/enums';

/**
 * Coordinates mirror a real 6-page Mandiri e-Statement: `No` at x=20, date/time
 * at x=52, description at x=124, `Nominal` right-aligned near x=390 and `Saldo`
 * near x=531. Rows sit ~46pt apart.
 */
const item = (x: number, y: number, str: string, width = 40): PdfTextItem => ({
  x,
  y,
  width,
  str,
});

/** One transaction laid out the way the PDF actually places its cells. */
function rowItems(options: {
  no: string;
  y: number;
  date: string;
  time: string;
  description: string[];
  nominal: string;
  saldo: string;
}): PdfTextItem[] {
  const { no, y, date, time, description, nominal, saldo } = options;
  return [
    item(20, y, no, 4),
    item(52, y + 4, date),
    item(52, y - 5, time),
    ...description.map((line, index) => item(124, y + 10 - index * 10, line)),
    item(390, y, nominal),
    item(531, y, saldo),
  ];
}

const PAGE_HEADER: PdfTextItem[] = [
  item(16, 780, 'e-Statement'),
  item(
    123,
    770,
    'Menara Mandiri 1 Jalan Jenderal Sudirman Kav. 54-55, Jakarta 12190, Indonesia',
  ),
  item(123, 736, 'YERIKHO WILLIAM'),
  item(340, 736, '01 Jul 2026 - 31 Jul 2026'),
  item(160, 647, '1380027697569'),
  item(527, 667, '50.968,00'),
  item(503, 644, '+ 20.835.500,00'),
  item(542, 726, '1 of'),
  // Column titles sit just above the first row and must not be absorbed by it.
  item(20, 540, 'No'),
  item(52, 540, 'Tanggal'),
  item(124, 540, 'Keterangan'),
  item(380, 540, 'Nominal (IDR)'),
  item(529, 540, 'Saldo (IDR)'),
];

const PAGE_FOOTER: PdfTextItem[] = [
  item(
    16,
    60,
    'PT Bank Mandiri (Persero) Tbk. berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK) dan Bank Indonesia (BI),',
  ),
  item(520, 60, 'Mandiri Call 14000'),
];

describe('extractMandiriRows', () => {
  it('reads each column and ignores page header, column titles and footer', () => {
    const items = [
      ...PAGE_HEADER,
      ...rowItems({
        no: '1',
        y: 492,
        date: '01 Jul 2026',
        time: '17:07:00 WIB',
        description: [
          'Transfer dari Bank lain',
          'SEABANK INDONESIA CHANDRA HADI WIJAY',
          '901012997972',
        ],
        nominal: '+10.000,00',
        saldo: '60.968,00',
      }),
      ...PAGE_FOOTER,
    ];

    expect(extractMandiriRows(items)).toEqual([
      {
        no: 1,
        date: '01 Jul 2026',
        time: '17:07:00 WIB',
        description:
          'Transfer dari Bank lain SEABANK INDONESIA CHANDRA HADI WIJAY 901012997972',
        nominal: '+10.000,00',
      },
    ]);
  });

  it('keeps adjacent rows separate rather than merging their descriptions', () => {
    const items = [
      ...rowItems({
        no: '2',
        y: 446,
        date: '02 Jul 2026',
        time: '11:58:28 WIB',
        description: ['Pembayaran QR', 'ke RISOLES keylla 5812, Amba'],
        nominal: '-8.000,00',
        saldo: '52.968,00',
      }),
      ...rowItems({
        no: '3',
        y: 400,
        date: '03 Jul 2026',
        time: '05:41:41 WIB',
        description: ['Biaya administrasi kartu debit'],
        nominal: '-6.000,00',
        saldo: '46.968,00',
      }),
    ];

    const rows = extractMandiriRows(items);

    expect(rows.map((row) => row.no)).toEqual([2, 3]);
    expect(rows[0].description).toBe(
      'Pembayaran QR ke RISOLES keylla 5812, Amba',
    );
    expect(rows[1].description).toBe('Biaya administrasi kartu debit');
  });

  it('returns nothing for a page with no transactions (the disclaimer page)', () => {
    expect(
      extractMandiriRows([
        item(60, 700, 'Disclaimer'),
        item(
          70,
          680,
          'e-Statement ini merupakan dokumen elektronik bersifat utuh',
        ),
      ]),
    ).toEqual([]);
  });
});

describe('parseMandiriRows', () => {
  const row = (overrides: Partial<MandiriPdfRow> = {}): MandiriPdfRow => ({
    no: 1,
    date: '01 Jul 2026',
    time: '17:07:00 WIB',
    description: 'Transfer dari Bank lain',
    nominal: '+10.000,00',
    ...overrides,
  });

  it('maps a leading + to INFLOW and a leading - to OUTFLOW', () => {
    const result = parseMandiriRows([
      row({ nominal: '+10.000,00' }),
      row({ no: 2, nominal: '-8.000,00', description: 'Pembayaran QR' }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      amount: '10000.00',
      type: TransactionType.INFLOW,
      externalRef: null,
    });
    expect(result[1]).toMatchObject({
      amount: '8000.00',
      type: TransactionType.OUTFLOW,
    });
  });

  it('reads Indonesian number formatting, where dots group and the comma is decimal', () => {
    const result = parseMandiriRows([
      row({ nominal: '+1.099.500,00' }),
      row({ no: 2, nominal: '-11.530.000,00' }),
      row({ no: 3, nominal: '-2.459.233,00' }),
    ]);

    expect(result.map((entry) => entry.amount)).toEqual([
      '1099500.00',
      '11530000.00',
      '2459233.00',
    ]);
  });

  it('stores txnDate as midnight UTC and understands both month spellings', () => {
    const result = parseMandiriRows([
      row({ date: '01 Jul 2026' }),
      row({ no: 2, date: '15 Agu 2026' }),
      row({ no: 3, date: '20 Dec 2026' }),
    ]);

    expect(result.map((entry) => entry.txnDate.toISOString())).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-08-15T00:00:00.000Z',
      '2026-12-20T00:00:00.000Z',
    ]);
  });

  it('skips rows that are malformed rather than guessing a value', () => {
    const result = parseMandiriRows([
      row({ nominal: null }),
      row({ no: 2, date: null }),
      row({ no: 3, date: '30 Feb 2026' }),
      row({ no: 4, nominal: '10.000,00' }), // no +/- sign, so no direction
      row({ no: 5, nominal: '+0,00' }),
      row({ no: 6, description: '   ' }),
      row({ no: 7, nominal: '+7.500,00', description: 'Baris valid' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      amount: '7500.00',
      description: 'Baris valid',
    });
  });

  it('distinguishes two rows that share a timestamp', () => {
    const result = parseMandiriRows([
      row({
        no: 35,
        date: '23 Jul 2026',
        time: '17:36:03 WIB',
        nominal: '-1.000,00',
        description: 'Biaya transaksi bank Pembayaran Tokopedia',
      }),
      row({
        no: 36,
        date: '23 Jul 2026',
        time: '17:36:03 WIB',
        nominal: '-52.500,00',
        description: 'Pembayaran Tokopedia 8870881542727828',
      }),
    ]);

    expect(result[0].dedupHash).not.toBe(result[1].dedupHash);
  });

  it('still distinguishes rows identical in every parsed field', () => {
    const identical = [row(), row({ no: 2 })];
    const result = parseMandiriRows(identical);

    expect(result).toHaveLength(2);
    expect(result[0].dedupHash).not.toBe(result[1].dedupHash);
  });

  it('produces the same hashes on re-parse, so re-importing is a no-op', () => {
    const rows = [
      row(),
      row({ no: 2, nominal: '-8.000,00', description: 'Pembayaran QR' }),
    ];

    expect(parseMandiriRows(rows).map((entry) => entry.dedupHash)).toEqual(
      parseMandiriRows(rows).map((entry) => entry.dedupHash),
    );
  });

  it('excludes the row number from the hash, so an overlapping re-import dedups', () => {
    // The same transaction, renumbered because the second statement covers a
    // different period. It must hash identically or it would import twice.
    const first = parseMandiriRows([row({ no: 12 })]);
    const second = parseMandiriRows([row({ no: 3 })]);

    expect(first[0].dedupHash).toBe(second[0].dedupHash);
  });
});
