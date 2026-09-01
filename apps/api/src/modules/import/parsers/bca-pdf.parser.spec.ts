import {
  extractBcaPeriod,
  extractBcaRows,
  parseBcaRows,
  BcaPdfRow,
} from './bca-pdf.parser';
import { PdfTextItem } from './pdf-text.util';
import { TransactionType } from '../../../generated/prisma/enums';

/**
 * Coordinates mirror a real 7-page BCA "Laporan Mutasi Rekening": TANGGAL at
 * x=43, KETERANGAN at x=88.7, detail at x=194.3, CBG at x=308.1, MUTASI
 * right-aligned near x=400, the `DB` marker at x=442 and SALDO near x=535.
 *
 * Row height varies with the detail block — 12.1pt between a row's own lines,
 * 14.1pt from a row's last line to the next row's date marker — which is the
 * property the extractor has to cope with.
 */
const item = (x: number, y: number, str: string, width = 40): PdfTextItem => ({
  x,
  y,
  width,
  str,
});

const LINE_PITCH = 12.1;
const ROW_GAP = 14.1;

interface RowSpec {
  y: number;
  date: string;
  keterangan?: string;
  detail?: string[];
  cbg?: string;
  mutasi?: string;
  /** `DB` marks an outflow; omitted means an inflow. */
  flag?: string;
  saldo?: string;
}

/** One transaction laid out the way the PDF actually places its cells. */
function rowItems(spec: RowSpec): PdfTextItem[] {
  const items = [item(43, spec.y, spec.date, 21)];
  if (spec.keterangan) items.push(item(88.7, spec.y, spec.keterangan));
  if (spec.cbg) items.push(item(308.1, spec.y, spec.cbg, 18));
  if (spec.mutasi) items.push(item(400, spec.y, spec.mutasi));
  if (spec.flag) items.push(item(442, spec.y, spec.flag, 10));
  if (spec.saldo) items.push(item(535, spec.y, spec.saldo));
  (spec.detail ?? []).forEach((line, index) => {
    items.push(item(194.3, spec.y - index * LINE_PITCH, line));
  });
  return items;
}

/** The y the next row's date marker sits at, given this row's height. */
const nextY = (spec: RowSpec) =>
  spec.y - (Math.max(spec.detail?.length ?? 0, 1) - 1) * LINE_PITCH - ROW_GAP;

const PAGE_HEADER: PdfTextItem[] = [
  item(167.3, 795.8, 'REKENING TAHAPAN XPRESI'),
  item(31, 754.4, 'PT OHMYPOS NUSANTARA'),
  item(324.4, 755.4, 'NO. REKENING'),
  item(435.3, 755.4, '3940774470'),
  item(324.4, 739.3, 'HALAMAN'),
  item(324.4, 723.2, 'PERIODE'),
  item(416.8, 723.2, ':'),
  item(435.3, 723.2, 'AGUSTUS 2026'),
  item(324.4, 707.1, 'MATA UANG'),
  item(435.3, 707.1, 'IDR'),
  // Letter-spaced legal notice; parts of it land in the CBG and MUTASI columns.
  item(305.9, 649.5, 'B C A  b e r h a k  m e l a k u k a n  k o r e k s i'),
  item(34.4, 639.1, 'R e k e n i n g  i n i  s a m p a i  d e n g a n'),
  // Column titles sit just above the first row and must not be absorbed by it.
  item(33.1, 596.7, 'TANGGAL'),
  item(163.9, 596.7, 'KETERANGAN'),
  item(308.0, 596.7, 'CBG'),
  item(380.3, 596.7, 'MUTASI'),
  item(500.5, 596.7, 'SALDO'),
];

/** The closing totals block, which follows the last row of the final page. */
const SUMMARY: PdfTextItem[] = [
  item(208.5, 329.9, 'SALDO AWAL'),
  item(265.2, 329.9, ':'),
  item(328.2, 329.9, '469,033.88'),
  item(208.5, 317.8, 'MUTASI CR'),
  item(265.2, 317.8, ':'),
  item(319.9, 317.8, '3,440,700.00'),
  item(407.2, 317.8, '20'),
  item(208.5, 305.6, 'MUTASI DB'),
  item(265.2, 305.6, ':'),
  item(321.0, 305.6, '3,826,360.00'),
  item(407.4, 305.6, '43'),
  item(208.5, 293.5, 'SALDO AKHIR'),
  item(265.2, 293.5, ':'),
  item(333.9, 293.5, '83,373.88'),
];

const PERIOD = { month: 8, year: 2026 };

/** A well-formed row, for tests that only care about one varying field. */
const row = (overrides: Partial<BcaPdfRow> = {}): BcaPdfRow => ({
  date: '13/08',
  keterangan: 'BI-FAST DB',
  detail: 'BIF TRANSFER KE 002 NATALIA DIAH KUSUM M-BCA',
  cbg: null,
  mutasi: '30,000.00',
  flag: 'DB',
  ...overrides,
});

describe('extractBcaPeriod', () => {
  it('reads the month and year from the page header', () => {
    expect(extractBcaPeriod(PAGE_HEADER)).toEqual({ month: 8, year: 2026 });
  });

  it('accepts every Indonesian month name', () => {
    const months = [
      ['JANUARI', 1],
      ['FEBRUARI', 2],
      ['MARET', 3],
      ['APRIL', 4],
      ['MEI', 5],
      ['JUNI', 6],
      ['JULI', 7],
      ['AGUSTUS', 8],
      ['SEPTEMBER', 9],
      ['OKTOBER', 10],
      ['NOVEMBER', 11],
      ['DESEMBER', 12],
    ] as const;

    for (const [name, expected] of months) {
      const header = [
        item(324.4, 723.2, 'PERIODE'),
        item(435.3, 723.2, `${name} 2026`),
      ];
      expect(extractBcaPeriod(header)).toEqual({ month: expected, year: 2026 });
    }
  });

  it('returns null when the header is missing or unrecognised', () => {
    expect(extractBcaPeriod([])).toBeNull();
    expect(
      extractBcaPeriod([
        item(324.4, 723.2, 'PERIODE'),
        item(435.3, 723.2, 'SMAWEEK 2026'),
      ]),
    ).toBeNull();
  });

  it('ignores a value that is not on the label baseline', () => {
    expect(
      extractBcaPeriod([
        item(324.4, 723.2, 'PERIODE'),
        item(435.3, 500, 'AGUSTUS 2026'),
      ]),
    ).toBeNull();
  });
});

describe('extractBcaRows', () => {
  it('slices each column into its own cell', () => {
    const spec: RowSpec = {
      y: 576,
      date: '04/08',
      keterangan: 'BIAYA ADM',
      cbg: '0998',
      mutasi: '10,000.00',
      flag: 'DB',
      saldo: '3,533.88',
    };

    expect(extractBcaRows([...PAGE_HEADER, ...rowItems(spec)])).toEqual([
      {
        date: '04/08',
        keterangan: 'BIAYA ADM',
        detail: '',
        cbg: '0998',
        mutasi: '10,000.00',
        flag: 'DB',
      },
    ]);
  });

  it('keeps every detail line of a tall row, not just the first few', () => {
    // A five-line GoPay top-up spans ~48pt below its marker — further than any
    // fixed row height would allow, so the row must run to the next marker.
    const tall: RowSpec = {
      y: 523.5,
      date: '01/08',
      keterangan: 'TRSF E-BANKING CR',
      detail: [
        '0108/FTSCY/WS95051',
        '205000.00',
        'GoPay Bank Transfe',
        'ID2621335379533AJQ',
        'DOMPET ANAK BANGSA',
      ],
      mutasi: '205,000.00',
    };
    const after: RowSpec = {
      y: nextY(tall),
      date: '02/08',
      keterangan: 'BIAYA ADM',
      mutasi: '10,000.00',
      flag: 'DB',
    };

    const rows = extractBcaRows([
      ...PAGE_HEADER,
      ...rowItems(tall),
      ...rowItems(after),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].detail).toBe(
      '0108/FTSCY/WS95051 205000.00 GoPay Bank Transfe ID2621335379533AJQ DOMPET ANAK BANGSA',
    );
    expect(rows[1].detail).toBe('');
  });

  it('does not let the first row absorb the column titles above it', () => {
    const rows = extractBcaRows([
      ...PAGE_HEADER,
      ...rowItems({
        y: 576,
        date: '01/08',
        keterangan: 'SALDO AWAL',
        saldo: '469,033.88',
      }),
    ]);

    expect(rows[0].keterangan).toBe('SALDO AWAL');
    expect(rows[0].detail).toBe('');
    expect(rows[0].cbg).toBeNull();
    expect(rows[0].mutasi).toBeNull();
  });

  it('keeps the closing totals block out of a short last row', () => {
    // The block's amounts land in the CBG column and its counts in MUTASI, so a
    // single-line last row 44pt above it would otherwise pick up both.
    const last: RowSpec = {
      y: 374,
      date: '30/08',
      keterangan: 'BUNGA',
      cbg: '0998',
      mutasi: '1,204.11',
    };

    const rows = extractBcaRows([
      ...PAGE_HEADER,
      ...rowItems(last),
      ...SUMMARY,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      date: '30/08',
      keterangan: 'BUNGA',
      detail: '',
      cbg: '0998',
      mutasi: '1,204.11',
      flag: '',
    });
  });

  it('keeps the carry-over footer out of the last row', () => {
    // `Bersambung ke halaman berikut` is rendered at x=400 — inside the MUTASI
    // column — so an amount-less last row could otherwise inherit it.
    const rows = extractBcaRows([
      ...PAGE_HEADER,
      ...rowItems({ y: 60, date: '13/08', keterangan: 'BI-FAST CR' }),
      item(400, 35, 'Bersambung ke halaman berikut'),
    ]);

    expect(rows[0].mutasi).toBeNull();
    expect(rows[0].detail).toBe('');
  });

  it('returns nothing for a page with no transaction rows', () => {
    expect(extractBcaRows([...PAGE_HEADER, ...SUMMARY])).toEqual([]);
  });
});

describe('parseBcaRows', () => {
  it('reads an outflow from the DB marker and an inflow from its absence', () => {
    const parsed = parseBcaRows(
      [
        row({ mutasi: '30,000.00', flag: 'DB' }),
        row({ date: '14/08', mutasi: '250,000.00', flag: '' }),
      ],
      PERIOD,
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].type).toBe(TransactionType.OUTFLOW);
    expect(parsed[0].amount).toBe('30000.00');
    expect(parsed[1].type).toBe(TransactionType.INFLOW);
    expect(parsed[1].amount).toBe('250000.00');
  });

  it('reads BCA money formatting, where the comma groups and the dot divides', () => {
    const parsed = parseBcaRows(
      [
        row({ mutasi: '1.00' }),
        row({ date: '14/08', mutasi: '125,750,000.00' }),
        row({ date: '15/08', mutasi: '1,204.11' }),
      ],
      PERIOD,
    );

    expect(parsed.map((entry) => entry.amount)).toEqual([
      '1.00',
      '125750000.00',
      '1204.11',
    ]);
  });

  it('dates a row from the statement period, since the row carries no year', () => {
    const parsed = parseBcaRows([row({ date: '13/08' })], PERIOD);
    expect(parsed[0].txnDate).toEqual(new Date(Date.UTC(2026, 7, 13)));
  });

  it('rolls the year back for a December row on a January statement', () => {
    const parsed = parseBcaRows([row({ date: '31/12' })], {
      month: 1,
      year: 2027,
    });
    expect(parsed[0].txnDate).toEqual(new Date(Date.UTC(2026, 11, 31)));
  });

  it('joins keterangan, detail and CBG into one description', () => {
    const parsed = parseBcaRows(
      [
        row({
          keterangan: 'BIAYA ADM',
          detail: '',
          cbg: '0998',
        }),
      ],
      PERIOD,
    );

    expect(parsed[0].description).toBe('BIAYA ADM 0998');
  });

  it('truncates a description at the 500-character contract limit', () => {
    const parsed = parseBcaRows(
      [row({ detail: 'PEMBAYARAN GABUNGAN LINTAS SUPPLIER '.repeat(30) })],
      PERIOD,
    );

    expect(parsed[0].description).toHaveLength(500);
  });

  it('never sets externalRef, which BCA has no column for', () => {
    const parsed = parseBcaRows([row()], PERIOD);
    expect(parsed[0].externalRef).toBeNull();
  });

  describe('skips rows it cannot trust', () => {
    const cases: Array<[string, BcaPdfRow]> = [
      [
        'the SALDO AWAL opening row, which carries no amount',
        row({ keterangan: 'SALDO AWAL', detail: '', mutasi: null, flag: '' }),
      ],
      ['a missing amount', row({ mutasi: null })],
      ['an amount with no decimals', row({ mutasi: '100000' })],
      ["Mandiri's dot-grouped formatting", row({ mutasi: '1.000.000,00' })],
      ['a signed amount', row({ mutasi: '+30,000.00' })],
      ['a zero amount', row({ mutasi: '0.00' })],
      ['a calendar day that does not exist', row({ date: '31/02' })],
      ['a month outside the statement period', row({ date: '15/06' })],
      ['a month that is not a month', row({ date: '13/13' })],
      ['a direction marker that is neither DB nor blank', row({ flag: 'XX' })],
      [
        'an entirely empty description',
        row({ keterangan: '', detail: '', cbg: null }),
      ],
    ];

    it.each(cases)('%s', (_label, malformed) => {
      expect(parseBcaRows([malformed], PERIOD)).toEqual([]);
    });

    it('keeps the valid rows around a malformed one', () => {
      const parsed = parseBcaRows(
        [
          row({ date: '01/08', mutasi: '1,500,000.00', flag: '' }),
          row({ date: '31/02' }),
          row({ date: '13/08', mutasi: '875,000.00', flag: '' }),
        ],
        PERIOD,
      );

      expect(parsed).toHaveLength(2);
      expect(parsed.map((entry) => entry.amount)).toEqual([
        '1500000.00',
        '875000.00',
      ]);
    });
  });

  describe('dedupHash', () => {
    it('gives byte-identical rows distinct hashes', () => {
      const identical = [row(), row(), row()];
      const hashes = parseBcaRows(identical, PERIOD).map((e) => e.dedupHash);

      expect(new Set(hashes).size).toBe(3);
    });

    it('is stable across re-imports of an overlapping statement', () => {
      const first = parseBcaRows(
        [row({ date: '13/08' }), row({ date: '14/08' })],
        PERIOD,
      );
      // The same two transactions, re-imported as the tail of a longer file.
      const second = parseBcaRows(
        [
          row({ date: '01/08', mutasi: '99,000.00' }),
          row({ date: '13/08' }),
          row({ date: '14/08' }),
        ],
        PERIOD,
      );

      expect(second[1].dedupHash).toBe(first[0].dedupHash);
      expect(second[2].dedupHash).toBe(first[1].dedupHash);
    });

    it('separates rows that differ only in direction', () => {
      const [outflow, inflow] = parseBcaRows(
        [row({ flag: 'DB' }), row({ flag: '' })],
        PERIOD,
      );

      expect(outflow.dedupHash).not.toBe(inflow.dedupHash);
    });
  });
});
