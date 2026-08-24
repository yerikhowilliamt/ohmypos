/**
 * OhMyPos — turning a MatchingEngine candidate into an allocation request.
 *
 * `MatchCandidate` carries `bankTransactionIds` (plural) and a single
 * `matchedAmount` that is the TOTAL across them (matching.schema.ts:20), while
 * POST /allocations wants one (bankTransactionId, ledgerEntryId, amountPortion)
 * triple per row. The per-transaction amounts are therefore NOT in the
 * candidate and must be looked up from the bank-transaction rows.
 *
 * Allocating each transaction's full amount is correct: MatchingService only
 * ever feeds the engine transactions with status UNRESOLVED
 * (matching.service.ts:19), and UNRESOLVED means total_allocated = 0 per the
 * sync_transaction_status trigger — so nothing is already allocated against
 * them. Splitting evenly, or trusting matchedAmount per row, would be a money
 * bug; if a transaction is missing from the lookup this module refuses rather
 * than guesses.
 */
import type {
  BankTransactionResponse,
  CreateAllocation,
  CreateSingleAllocation,
  MatchCandidate,
} from '@ohmypos/api-contracts';
import {
  MONEY_SCALE,
  addFixed,
  compareFixed,
  parseFixed,
  zero,
} from '@/lib/decimal';

/**
 * A stable identity for a candidate. The API returns no id — candidates are
 * computed, never persisted — so the queue needs one for React keys and for
 * the dismissed-set.
 */
export function candidateKey(candidate: MatchCandidate): string {
  return `${candidate.ledgerEntryId}::${[...candidate.bankTransactionIds]
    .sort()
    .join(',')}`;
}

export type BuildAllocationsResult =
  | { ok: true; payload: CreateAllocation }
  | { ok: false; reason: 'UNKNOWN_TRANSACTION'; missingIds: string[] }
  | { ok: false; reason: 'AMOUNT_MISMATCH' };

/**
 * @param makeIdempotencyKey injected so tests are deterministic; production
 *   passes `() => crypto.randomUUID()`.
 */
export function buildAllocationsForCandidate(
  candidate: MatchCandidate,
  transactionsById: Readonly<Record<string, BankTransactionResponse>>,
  makeIdempotencyKey: () => string,
): BuildAllocationsResult {
  const missingIds = candidate.bankTransactionIds.filter(
    (id) => !transactionsById[id],
  );
  if (missingIds.length > 0) {
    return { ok: false, reason: 'UNKNOWN_TRANSACTION', missingIds };
  }

  const allocations: CreateSingleAllocation[] =
    candidate.bankTransactionIds.map((id) => ({
      bankTransactionId: id,
      ledgerEntryId: candidate.ledgerEntryId,
      amountPortion: transactionsById[id].amount,
      idempotencyKey: makeIdempotencyKey(),
    }));

  // Cross-check against the engine's own total. A mismatch means the cached
  // transaction rows are stale relative to the candidate — refuse and let the
  // operator refresh rather than post amounts the engine never proposed.
  const total = allocations.reduce(
    (sum, item) => addFixed(sum, parseFixed(item.amountPortion, MONEY_SCALE)),
    zero(MONEY_SCALE),
  );
  if (
    compareFixed(total, parseFixed(candidate.matchedAmount, MONEY_SCALE)) !== 0
  ) {
    return { ok: false, reason: 'AMOUNT_MISMATCH' };
  }

  return { ok: true, payload: { allocations } };
}

export const MATCH_TYPE_LABELS: Readonly<
  Record<MatchCandidate['matchType'], string>
> = {
  EXACT: 'Sama Persis',
  FUZZY: 'Beda Tanggal',
  AGGREGATION: 'Gabungan',
};

/** `0.9` → `90%`. The engine emits a 0–1 confidence (matching-engine.ts:175). */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
