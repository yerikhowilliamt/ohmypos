import Decimal from 'decimal.js';

// Ported verbatim from Kasync — pure domain logic, no database or tenancy
// coupling, so nothing needed adapting (ERD §7).

export interface BankTransactionInput {
  id: string;
  amount: Decimal;
  type: 'INFLOW' | 'OUTFLOW';
  txnDate: Date;
  status?: string;
}

export interface LedgerEntryInput {
  id: string;
  amount: Decimal;
  type: 'INFLOW' | 'OUTFLOW';
  entryDate: Date;
}

export enum MatchType {
  EXACT = 'EXACT',
  FUZZY = 'FUZZY',
  AGGREGATION = 'AGGREGATION',
}

export interface MatchCandidate {
  matchType: MatchType;
  confidence: number;
  bankTransactionIds: string[];
  ledgerEntryId: string;
  matchedAmount: Decimal;
  dateDifferenceDays: number;
}

export interface MatchingOptions {
  dateToleranceDays?: number;
  maxAggregationSubsetSize?: number;
  maxCandidates?: number;
}

export class MatchingEngine {
  private readonly defaultOptions: Required<MatchingOptions> = {
    dateToleranceDays: 3,
    maxAggregationSubsetSize: 4,
    maxCandidates: 20,
  };

  public proposeMatches(
    bankTxns: BankTransactionInput[],
    ledgerEntries: LedgerEntryInput[],
    options?: MatchingOptions,
  ): MatchCandidate[] {
    const opts = { ...this.defaultOptions, ...options };
    const candidates: MatchCandidate[] = [];

    // Track bank transactions that are definitely matched via exact match to skip them in fuzzy/aggregation
    const exactMatchedBankTxnIds = new Set<string>();
    const exactMatchedLedgerIds = new Set<string>();

    // 1. Exact Matches
    for (const entry of ledgerEntries) {
      for (const txn of bankTxns) {
        if (exactMatchedBankTxnIds.has(txn.id)) continue;

        if (this.isExactMatch(txn, entry)) {
          candidates.push({
            matchType: MatchType.EXACT,
            confidence: 1.0,
            bankTransactionIds: [txn.id],
            ledgerEntryId: entry.id,
            matchedAmount: entry.amount,
            dateDifferenceDays: 0,
          });
          exactMatchedBankTxnIds.add(txn.id);
          exactMatchedLedgerIds.add(entry.id);
          break; // One exact match per ledger entry
        }
      }
    }

    // 2. Fuzzy Matches
    for (const entry of ledgerEntries) {
      if (exactMatchedLedgerIds.has(entry.id)) continue;

      for (const txn of bankTxns) {
        if (exactMatchedBankTxnIds.has(txn.id)) continue;

        if (txn.type === entry.type && txn.amount.equals(entry.amount)) {
          const diffDays = this.getDateDiffDays(txn.txnDate, entry.entryDate);
          if (diffDays > 0 && diffDays <= opts.dateToleranceDays) {
            candidates.push({
              matchType: MatchType.FUZZY,
              confidence: this.calculateFuzzyConfidence(diffDays),
              bankTransactionIds: [txn.id],
              ledgerEntryId: entry.id,
              matchedAmount: entry.amount,
              dateDifferenceDays: diffDays,
            });
          }
        }
      }
    }

    // 3. Aggregation Matches
    for (const entry of ledgerEntries) {
      if (exactMatchedLedgerIds.has(entry.id)) continue;

      const availableTxns = bankTxns.filter(
        (t) =>
          !exactMatchedBankTxnIds.has(t.id) &&
          t.type === entry.type &&
          this.getDateDiffDays(t.txnDate, entry.entryDate) <=
            opts.dateToleranceDays,
      );

      const subsets = this.getSubsets(
        availableTxns,
        opts.maxAggregationSubsetSize,
      );

      for (const subset of subsets) {
        const sumAmount = subset.reduce(
          (acc, t) => acc.plus(t.amount),
          new Decimal(0),
        );
        if (sumAmount.equals(entry.amount)) {
          const maxDiffDays = Math.max(
            ...subset.map((t) =>
              this.getDateDiffDays(t.txnDate, entry.entryDate),
            ),
          );

          candidates.push({
            matchType: MatchType.AGGREGATION,
            confidence: this.calculateAggregationConfidence(maxDiffDays),
            bankTransactionIds: subset.map((t) => t.id),
            ledgerEntryId: entry.id,
            matchedAmount: sumAmount,
            dateDifferenceDays: maxDiffDays,
          });
        }
      }
    }

    // Sort and limit
    return candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, opts.maxCandidates);
  }

  private isExactMatch(
    txn: BankTransactionInput,
    entry: LedgerEntryInput,
  ): boolean {
    if (txn.type !== entry.type) return false;
    if (!txn.amount.equals(entry.amount)) return false;
    return this.getDateDiffDays(txn.txnDate, entry.entryDate) === 0;
  }

  private getDateDiffDays(d1: Date, d2: Date): number {
    const utc1 = Date.UTC(
      d1.getUTCFullYear(),
      d1.getUTCMonth(),
      d1.getUTCDate(),
    );
    const utc2 = Date.UTC(
      d2.getUTCFullYear(),
      d2.getUTCMonth(),
      d2.getUTCDate(),
    );
    return Math.abs(Math.round((utc1 - utc2) / (1000 * 60 * 60 * 24)));
  }

  private calculateFuzzyConfidence(diffDays: number): number {
    // 1 day = 0.90, 2 days = 0.80, 3 days = 0.70
    return Math.max(0, 1.0 - diffDays * 0.1);
  }

  private calculateAggregationConfidence(maxDiffDays: number): number {
    // e.g. 0.85 - (0.05 * dateDiff)
    return Math.max(0, 0.85 - maxDiffDays * 0.05);
  }

  private getSubsets(
    arr: BankTransactionInput[],
    maxSize: number,
  ): BankTransactionInput[][] {
    const results: BankTransactionInput[][] = [];
    // Guard against combinatorial explosion by truncating candidate pool to max 20 items
    const boundedArr = arr.length > 20 ? arr.slice(0, 20) : arr;
    const n = boundedArr.length;
    const limit = Math.min(maxSize, n);

    for (let size = 2; size <= limit; size++) {
      this.combine(boundedArr, size, 0, [], results);
    }
    return results;
  }

  private combine(
    arr: BankTransactionInput[],
    size: number,
    start: number,
    current: BankTransactionInput[],
    results: BankTransactionInput[][],
  ): void {
    if (current.length === size) {
      results.push([...current]);
      return;
    }
    for (let i = start; i <= arr.length - (size - current.length); i++) {
      current.push(arr[i]);
      this.combine(arr, size, i + 1, current, results);
      current.pop();
    }
  }
}
