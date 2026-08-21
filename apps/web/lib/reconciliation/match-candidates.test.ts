import { describe, expect, it } from 'vitest';
import type {
  BankTransactionResponse,
  MatchCandidate,
} from '@ohmypos/api-contracts';
import {
  buildAllocationsForCandidate,
  candidateKey,
  formatConfidence,
} from './match-candidates';

function txn(id: string, amount: string): BankTransactionResponse {
  return {
    id,
    accountId: 'acc-1',
    txnDate: '2026-02-01T00:00:00.000Z',
    amount,
    type: 'INFLOW',
    description: `txn ${id}`,
    externalRef: null,
    status: 'PENDING_REVIEW',
    importedAt: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };
}

const keys = () => {
  let n = 0;
  return () => `key-${(n += 1)}`;
};

describe('candidateKey', () => {
  it('is order-independent across bankTransactionIds', () => {
    const a: MatchCandidate = {
      matchType: 'AGGREGATION',
      confidence: 0.85,
      bankTransactionIds: ['t1', 't2'],
      ledgerEntryId: 'e1',
      matchedAmount: '100.00',
      dateDifferenceDays: 0,
    };
    const b: MatchCandidate = { ...a, bankTransactionIds: ['t2', 't1'] };

    expect(candidateKey(a)).toBe(candidateKey(b));
  });
});

describe('buildAllocationsForCandidate', () => {
  it('builds one allocation for an EXACT candidate', () => {
    const candidate: MatchCandidate = {
      matchType: 'EXACT',
      confidence: 1,
      bankTransactionIds: ['t1'],
      ledgerEntryId: 'e1',
      matchedAmount: '100.00',
      dateDifferenceDays: 0,
    };

    const result = buildAllocationsForCandidate(
      candidate,
      { t1: txn('t1', '100.00') },
      keys(),
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        allocations: [
          {
            bankTransactionId: 't1',
            ledgerEntryId: 'e1',
            amountPortion: '100.00',
            idempotencyKey: 'key-1',
          },
        ],
      },
    });
  });

  it('builds one allocation per transaction for an AGGREGATION candidate', () => {
    const candidate: MatchCandidate = {
      matchType: 'AGGREGATION',
      confidence: 0.85,
      bankTransactionIds: ['t1', 't2'],
      ledgerEntryId: 'e1',
      matchedAmount: '150.00',
      dateDifferenceDays: 1,
    };

    const result = buildAllocationsForCandidate(
      candidate,
      { t1: txn('t1', '100.00'), t2: txn('t2', '50.00') },
      keys(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.allocations).toHaveLength(2);
    expect(result.payload.allocations?.[0].amountPortion).toBe('100.00');
    expect(result.payload.allocations?.[1].amountPortion).toBe('50.00');
  });

  it('refuses when a transaction is missing from the lookup', () => {
    const candidate: MatchCandidate = {
      matchType: 'AGGREGATION',
      confidence: 0.85,
      bankTransactionIds: ['t1', 't-missing'],
      ledgerEntryId: 'e1',
      matchedAmount: '150.00',
      dateDifferenceDays: 0,
    };

    expect(
      buildAllocationsForCandidate(
        candidate,
        { t1: txn('t1', '100.00') },
        keys(),
      ),
    ).toEqual({
      ok: false,
      reason: 'UNKNOWN_TRANSACTION',
      missingIds: ['t-missing'],
    });
  });

  it('refuses when the per-transaction amounts do not sum to matchedAmount', () => {
    const candidate: MatchCandidate = {
      matchType: 'AGGREGATION',
      confidence: 0.85,
      bankTransactionIds: ['t1', 't2'],
      ledgerEntryId: 'e1',
      matchedAmount: '150.00',
      dateDifferenceDays: 0,
    };

    const result = buildAllocationsForCandidate(
      candidate,
      { t1: txn('t1', '100.00'), t2: txn('t2', '49.99') },
      keys(),
    );

    expect(result).toEqual({ ok: false, reason: 'AMOUNT_MISMATCH' });
  });

  it('tolerates the unpadded decimal strings Prisma actually sends', () => {
    // Decimal(18,2) holding 100.00 serialises as "100", not "100.00".
    const candidate: MatchCandidate = {
      matchType: 'EXACT',
      confidence: 1,
      bankTransactionIds: ['t1'],
      ledgerEntryId: 'e1',
      matchedAmount: '100',
      dateDifferenceDays: 0,
    };

    expect(
      buildAllocationsForCandidate(
        candidate,
        { t1: txn('t1', '100.00') },
        keys(),
      ).ok,
    ).toBe(true);
  });
});

describe('formatConfidence', () => {
  it('renders the engine 0-1 score as a percentage', () => {
    expect(formatConfidence(1)).toBe('100%');
    expect(formatConfidence(0.9)).toBe('90%');
    expect(formatConfidence(0.85)).toBe('85%');
  });
});
