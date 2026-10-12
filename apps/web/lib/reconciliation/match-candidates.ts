/**
 * Turns a match candidate into allocation rows. Each transaction is allocated
 * its full amount (they are UNRESOLVED, so nothing is allocated yet); a
 * transaction missing from the lookup is refused, never guessed.
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

/** Stable identity for a computed (unpersisted) candidate. */
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

  // Refuse when cached transactions disagree with the engine's total (stale data).
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

/** `0.9` → `90%`. */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
