import { describe, expect, it } from 'vitest';
import {
  summariseDraft,
  sumActiveAllocations,
  toCreateAllocationPayload,
  toMoneyString,
  type DraftAllocationLine,
} from './allocation-draft';

function line(
  overrides: Partial<DraftAllocationLine> & { id: string },
): DraftAllocationLine {
  return {
    idempotencyKey: `key-${overrides.id}`,
    ledgerEntryId: 'entry-1',
    amountPortion: '',
    ...overrides,
  };
}

describe('sumActiveAllocations', () => {
  it('ignores REVOKED rows, matching allocation.service.ts:61', () => {
    const total = sumActiveAllocations([
      { status: 'ACTIVE', amountPortion: '60.00' },
      { status: 'REVOKED', amountPortion: '40.00' },
    ]);
    expect(toMoneyString(total)).toBe('60.00');
  });

  it('is 0.00 for an empty list', () => {
    expect(toMoneyString(sumActiveAllocations([]))).toBe('0.00');
  });
});

describe('summariseDraft — the cap boundary', () => {
  it('allows allocating exactly the transaction amount (the MATCHED case)', () => {
    const lines = [line({ id: 'a', amountPortion: '100.00' })];
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines,
    });

    expect(summary.overAllocated).toBe(false);
    expect(summary.submittable).toBe(true);
    expect(toMoneyString(summary.remaining)).toBe('0.00');
  });

  it('blocks one cent over the transaction amount', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [line({ id: 'a', amountPortion: '100.01' })],
    });

    expect(summary.overAllocated).toBe(true);
    expect(summary.submittable).toBe(false);
    expect(toMoneyString(summary.remaining)).toBe('-0.01');
  });

  it('counts already-committed ACTIVE allocations toward the cap', () => {
    // Mirrors allocation-sum.e2e-spec.ts:157 — 60 committed, 40.01 more is over.
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [{ status: 'ACTIVE', amountPortion: '60.00' }],
      lines: [line({ id: 'a', amountPortion: '40.01' })],
    });

    expect(summary.overAllocated).toBe(true);
    expect(toMoneyString(summary.allocated)).toBe('100.01');
  });

  it('allows the exact remainder on a partially allocated transaction', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [{ status: 'ACTIVE', amountPortion: '60.00' }],
      lines: [line({ id: 'a', amountPortion: '40.00' })],
    });

    expect(summary.overAllocated).toBe(false);
    expect(summary.submittable).toBe(true);
    expect(toMoneyString(summary.remaining)).toBe('0.00');
  });

  it('frees the amount again once an allocation is REVOKED', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [{ status: 'REVOKED', amountPortion: '100.00' }],
      lines: [line({ id: 'a', amountPortion: '100.00' })],
    });

    expect(summary.submittable).toBe(true);
  });

  it('sums several draft lines against one cap', () => {
    const summary = summariseDraft({
      transactionAmount: '1500000.00',
      allocations: [],
      lines: [
        line({ id: 'a', ledgerEntryId: 'e1', amountPortion: '1200000' }),
        line({ id: 'b', ledgerEntryId: 'e2', amountPortion: '300000' }),
      ],
    });

    expect(toMoneyString(summary.draft)).toBe('1500000.00');
    expect(toMoneyString(summary.remaining)).toBe('0.00');
    expect(summary.submittable).toBe(true);
  });

  it('does not lose precision on values a float would round', () => {
    const summary = summariseDraft({
      transactionAmount: '0.30',
      allocations: [],
      lines: [
        line({ id: 'a', ledgerEntryId: 'e1', amountPortion: '0.10' }),
        line({ id: 'b', ledgerEntryId: 'e2', amountPortion: '0.20' }),
      ],
    });

    expect(summary.overAllocated).toBe(false);
    expect(toMoneyString(summary.remaining)).toBe('0.00');
  });
});

describe('summariseDraft — per-line states', () => {
  it('treats a wholly empty line as BLANK and does not block submit', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [
        line({ id: 'a', ledgerEntryId: 'e1', amountPortion: '50.00' }),
        line({ id: 'b', ledgerEntryId: '', amountPortion: '' }),
      ],
    });

    expect(summary.lineStates.b).toBe('BLANK');
    expect(summary.submittable).toBe(true);
  });

  it('blocks a line with an amount but no ledger entry', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [line({ id: 'a', ledgerEntryId: '', amountPortion: '50.00' })],
    });

    expect(summary.lineStates.a).toBe('MISSING_ENTRY');
    expect(summary.submittable).toBe(false);
  });

  it('blocks a third decimal place, mirroring MoneyString', () => {
    // allocation-sum.e2e-spec.ts:295 — '10.001' is a 400 server-side.
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [line({ id: 'a', amountPortion: '10.001' })],
    });

    expect(summary.lineStates.a).toBe('TOO_MANY_DECIMALS');
    expect(summary.submittable).toBe(false);
  });

  it('blocks a zero amount, mirroring allocation.service.ts:94', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [line({ id: 'a', amountPortion: '0' })],
    });

    expect(summary.lineStates.a).toBe('NOT_POSITIVE');
  });

  it('blocks a malformed amount', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [line({ id: 'a', amountPortion: 'abc' })],
    });

    expect(summary.lineStates.a).toBe('MALFORMED_AMOUNT');
  });

  it('blocks two lines pointing at the same ledger entry', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [
        line({ id: 'a', ledgerEntryId: 'e1', amountPortion: '30.00' }),
        line({ id: 'b', ledgerEntryId: 'e1', amountPortion: '20.00' }),
      ],
    });

    expect(summary.lineStates.a).toBe('READY');
    expect(summary.lineStates.b).toBe('DUPLICATE_ENTRY');
    expect(summary.submittable).toBe(false);
    // The duplicate is excluded from the running total, not silently added.
    expect(toMoneyString(summary.draft)).toBe('30.00');
  });

  it('is not submittable with no READY line at all', () => {
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines: [line({ id: 'a', ledgerEntryId: '', amountPortion: '' })],
    });

    expect(summary.submittable).toBe(false);
  });
});

describe('toCreateAllocationPayload', () => {
  it('emits the batch form with only READY lines', () => {
    const lines = [
      line({ id: 'a', ledgerEntryId: 'e1', amountPortion: '30.00' }),
      line({ id: 'b', ledgerEntryId: '', amountPortion: '' }),
      line({ id: 'c', ledgerEntryId: 'e2', amountPortion: '70.00' }),
    ];
    const summary = summariseDraft({
      transactionAmount: '100.00',
      allocations: [],
      lines,
    });

    expect(
      toCreateAllocationPayload('txn-1', lines, summary.lineStates),
    ).toEqual({
      allocations: [
        {
          bankTransactionId: 'txn-1',
          ledgerEntryId: 'e1',
          amountPortion: '30.00',
          idempotencyKey: 'key-a',
        },
        {
          bankTransactionId: 'txn-1',
          ledgerEntryId: 'e2',
          amountPortion: '70.00',
          idempotencyKey: 'key-c',
        },
      ],
    });
  });
});
