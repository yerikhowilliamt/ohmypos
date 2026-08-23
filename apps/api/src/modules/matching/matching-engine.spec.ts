import Decimal from 'decimal.js';
import {
  MatchingEngine,
  BankTransactionInput,
  LedgerEntryInput,
  MatchType,
} from './matching-engine';

describe('MatchingEngine', () => {
  let engine: MatchingEngine;

  beforeEach(() => {
    engine = new MatchingEngine();
  });

  const createTxn = (
    id: string,
    amountStr: string,
    type: 'INFLOW' | 'OUTFLOW',
    daysOffset: number = 0,
  ): BankTransactionInput => {
    const d = new Date('2023-10-15T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + daysOffset);
    return {
      id,
      amount: new Decimal(amountStr),
      type,
      txnDate: d,
    };
  };

  const createEntry = (
    id: string,
    amountStr: string,
    type: 'INFLOW' | 'OUTFLOW',
    daysOffset: number = 0,
  ): LedgerEntryInput => {
    const d = new Date('2023-10-15T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + daysOffset);
    return {
      id,
      amount: new Decimal(amountStr),
      type,
      entryDate: d,
    };
  };

  it('finds EXACT match', () => {
    const txn = createTxn('T1', '100.50', 'INFLOW');
    const entry = createEntry('L1', '100.50', 'INFLOW');

    const { candidates, truncated } = engine.proposeMatches([txn], [entry]);

    expect(truncated).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe(MatchType.EXACT);
    expect(candidates[0].confidence).toBe(1.0);
    expect(candidates[0].bankTransactionIds).toEqual(['T1']);
    expect(candidates[0].ledgerEntryId).toBe('L1');
  });

  it('finds FUZZY match within tolerance', () => {
    // Txn is 2 days after ledger entry
    const txn = createTxn('T1', '200.00', 'OUTFLOW', 2);
    const entry = createEntry('L1', '200.00', 'OUTFLOW');

    const { candidates, truncated } = engine.proposeMatches([txn], [entry]);

    expect(truncated).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe(MatchType.FUZZY);
    expect(candidates[0].confidence).toBe(0.8); // 1.0 - 0.1 * 2
    expect(candidates[0].dateDifferenceDays).toBe(2);
  });

  it('ignores FUZZY match outside tolerance', () => {
    // Txn is 4 days after ledger entry, tolerance is 3
    const txn = createTxn('T1', '200.00', 'OUTFLOW', 4);
    const entry = createEntry('L1', '200.00', 'OUTFLOW');

    const { candidates, truncated } = engine.proposeMatches([txn], [entry]);

    expect(truncated).toBe(false);
    expect(candidates).toHaveLength(0);
  });

  it('finds AGGREGATION match (2 txns)', () => {
    const t1 = createTxn('T1', '50.00', 'INFLOW', 1);
    const t2 = createTxn('T2', '75.50', 'INFLOW', 2);
    const entry = createEntry('L1', '125.50', 'INFLOW');

    const { candidates } = engine.proposeMatches([t1, t2], [entry]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe(MatchType.AGGREGATION);
    expect(candidates[0].bankTransactionIds).toContain('T1');
    expect(candidates[0].bankTransactionIds).toContain('T2');
    expect(candidates[0].confidence).toBe(0.75); // 0.85 - (0.05 * 2 maxDiff)
  });

  it('ignores AGGREGATION match if subset exceeds max', () => {
    const t1 = createTxn('T1', '10', 'INFLOW');
    const t2 = createTxn('T2', '10', 'INFLOW');
    const t3 = createTxn('T3', '10', 'INFLOW');
    const t4 = createTxn('T4', '10', 'INFLOW');
    const t5 = createTxn('T5', '10', 'INFLOW');
    const entry = createEntry('L1', '50', 'INFLOW');

    const { candidates } = engine.proposeMatches(
      [t1, t2, t3, t4, t5],
      [entry],
      {
        maxAggregationSubsetSize: 4,
      },
    );

    expect(candidates).toHaveLength(0);
  });

  it('no match for different types or amounts', () => {
    const t1 = createTxn('T1', '100', 'INFLOW');
    const entry = createEntry('L1', '100', 'OUTFLOW'); // Diff type
    const entry2 = createEntry('L2', '99', 'INFLOW'); // Diff amount

    const { candidates } = engine.proposeMatches([t1], [entry, entry2]);

    expect(candidates).toHaveLength(0);
  });

  it('prioritizes exact matches and ranks candidates correctly', () => {
    const tExact = createTxn('T1', '100', 'INFLOW', 0);
    const lExact = createEntry('L1', '100', 'INFLOW', 0);

    const tFuzzy = createTxn('T2', '200', 'INFLOW', 1);
    const lFuzzy = createEntry('L2', '200', 'INFLOW', 0);

    const { candidates } = engine.proposeMatches(
      [tExact, tFuzzy],
      [lExact, lFuzzy],
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0].matchType).toBe(MatchType.EXACT); // 1.0 confidence
    expect(candidates[1].matchType).toBe(MatchType.FUZZY); // 0.9 confidence
    expect(candidates[1].ledgerEntryId).toBe('L2');
  });

  it('finds EXACT match for timestamps on same UTC day (midnight straddle)', () => {
    const txn = createTxn('T1', '500.00', 'INFLOW', 0);
    txn.txnDate = new Date('2024-06-15T23:50:00Z');
    const entry = createEntry('L1', '500.00', 'INFLOW', 0);
    entry.entryDate = new Date('2024-06-15T23:59:00Z');

    const { candidates } = engine.proposeMatches([txn], [entry]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe(MatchType.EXACT);
    expect(candidates[0].dateDifferenceDays).toBe(0);
  });

  it('finds FUZZY match for timestamps straddling midnight across UTC days', () => {
    const txn = createTxn('T1', '500.00', 'INFLOW', 0);
    txn.txnDate = new Date('2024-06-15T23:59:00Z');
    const entry = createEntry('L1', '500.00', 'INFLOW', 0);
    entry.entryDate = new Date('2024-06-16T00:01:00Z');

    const { candidates } = engine.proposeMatches([txn], [entry]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe(MatchType.FUZZY);
    expect(candidates[0].dateDifferenceDays).toBe(1);
  });

  it('returns empty array when bankTxns is empty', () => {
    const entry = createEntry('L1', '100.00', 'INFLOW');
    const { candidates } = engine.proposeMatches([], [entry]);
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when ledgerEntries is empty', () => {
    const txn = createTxn('T1', '100.00', 'INFLOW');
    const { candidates } = engine.proposeMatches([txn], []);
    expect(candidates).toHaveLength(0);
  });

  it('handles 21+ bank transactions without crash (getSubsets bound)', () => {
    const txns: BankTransactionInput[] = [];
    for (let i = 1; i <= 25; i++) {
      txns.push(createTxn(`T${i}`, '10.00', 'INFLOW', i));
    }
    const entry = createEntry('L1', '20.00', 'INFLOW', 1);

    const { candidates } = engine.proposeMatches(txns, [entry], {
      maxAggregationSubsetSize: 4,
    });

    expect(Array.isArray(candidates)).toBe(true);
    // Should find at least one aggregation match (any 2 txns summing to 20)
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('finds FUZZY match at exact 3-day tolerance boundary', () => {
    const txn = createTxn('T1', '100.00', 'INFLOW', 3);
    const entry = createEntry('L1', '100.00', 'INFLOW', 0);

    const { candidates } = engine.proposeMatches([txn], [entry]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe(MatchType.FUZZY);
    expect(candidates[0].dateDifferenceDays).toBe(3);
  });

  it('ignores FUZZY match at 4 days (exceeds default tolerance)', () => {
    const txn = createTxn('T1', '100.00', 'INFLOW', 4);
    const entry = createEntry('L1', '100.00', 'INFLOW', 0);

    const { candidates } = engine.proposeMatches([txn], [entry]);

    expect(candidates).toHaveLength(0);
  });
});
