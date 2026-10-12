import type {
  AllocationResponse,
  CreateAllocation,
  CreateSingleAllocation,
} from '@ohmypos/api-contracts';
import {
  MONEY_SCALE,
  addFixed,
  compareFixed,
  formatFixed,
  parseFixed,
  subFixed,
  zero,
  type Fixed,
} from '@/lib/decimal';

/**
 * A draft allocation line. `id` is stable for React; `idempotencyKey` rotates on
 * every edit so a retried, edited line is a new allocation.
 */
export interface DraftAllocationLine {
  id: string;
  idempotencyKey: string;
  ledgerEntryId: string;
  /** Raw string straight out of CurrencyInput — may be '' or malformed. */
  amountPortion: string;
}

export type DraftLineState =
  /** Both fields empty — ignored entirely, never blocks submit. */
  | 'BLANK'
  | 'MISSING_ENTRY'
  | 'MISSING_AMOUNT'
  | 'MALFORMED_AMOUNT'
  | 'TOO_MANY_DECIMALS'
  | 'NOT_POSITIVE'
  | 'DUPLICATE_ENTRY'
  | 'READY';

export interface DraftSummary {
  /** BankTransaction.amount. */
  transactionAmount: Fixed;
  /** Σ of ACTIVE allocations already persisted server-side. */
  committed: Fixed;
  /** Σ of READY draft lines. */
  draft: Fixed;
  /** committed + draft: the "Allocated" figure (DESIGN.md §12.3). */
  allocated: Fixed;
  /** transactionAmount − allocated. Negative when over-allocated. */
  remaining: Fixed;
  /** `allocated > transactionAmount`: strict, so equality (fully allocated) is valid. */
  overAllocated: boolean;
  /** Per-line state, keyed by DraftAllocationLine.id. */
  lineStates: Record<string, DraftLineState>;
  /** At least one READY line and nothing blocking. */
  submittable: boolean;
}

/** Mirrors `MoneyString`'s shape check. */
const MONEY_PATTERN = /^\d+(?:\.\d+)?$/;

/** Mirrors `MoneyString`'s scale: at most 2 dp. */
function decimalPlaces(value: string): number {
  return value.split('.')[1]?.length ?? 0;
}

/**
 * Classifies one line in isolation. `DUPLICATE_ENTRY` is not decidable here —
 * it needs the other lines — so it is applied by `summariseDraft`.
 */
function classifyLine(line: DraftAllocationLine): DraftLineState {
  const amount = line.amountPortion.trim();
  const hasEntry = line.ledgerEntryId.trim().length > 0;

  if (!hasEntry && amount.length === 0) return 'BLANK';
  if (!hasEntry) return 'MISSING_ENTRY';
  if (amount.length === 0) return 'MISSING_AMOUNT';
  if (!MONEY_PATTERN.test(amount)) return 'MALFORMED_AMOUNT';
  if (decimalPlaces(amount) > MONEY_SCALE) return 'TOO_MANY_DECIMALS';

  // The API rejects amountPortion <= 0, so zero is blocking.
  if (compareFixed(parseFixed(amount, MONEY_SCALE), zero(MONEY_SCALE)) <= 0) {
    return 'NOT_POSITIVE';
  }

  return 'READY';
}

/** Σ of persisted ACTIVE allocations; REVOKED rows are excluded, as on the server. */
export function sumActiveAllocations(
  allocations: ReadonlyArray<
    Pick<AllocationResponse, 'status' | 'amountPortion'>
  >,
): Fixed {
  return allocations.reduce<Fixed>(
    (total, allocation) =>
      allocation.status === 'ACTIVE'
        ? addFixed(total, parseFixed(allocation.amountPortion, MONEY_SCALE))
        : total,
    zero(MONEY_SCALE),
  );
}

export interface SummariseDraftInput {
  /** BankTransaction.amount as it arrived on the wire. */
  transactionAmount: string;
  /** Every allocation for this transaction, ACTIVE and REVOKED alike. */
  allocations: ReadonlyArray<
    Pick<AllocationResponse, 'status' | 'amountPortion'>
  >;
  lines: ReadonlyArray<DraftAllocationLine>;
}

export function summariseDraft({
  transactionAmount,
  allocations,
  lines,
}: SummariseDraftInput): DraftSummary {
  const amount = parseFixed(transactionAmount, MONEY_SCALE);
  const committed = sumActiveAllocations(allocations);

  const lineStates: Record<string, DraftLineState> = {};
  const seenEntryIds = new Set<string>();
  let draft = zero(MONEY_SCALE);
  let readyCount = 0;
  let blocked = false;

  for (const line of lines) {
    let state = classifyLine(line);

    // UI-only rule: two lines for one ledger entry is operator error.
    if (state === 'READY') {
      if (seenEntryIds.has(line.ledgerEntryId)) {
        state = 'DUPLICATE_ENTRY';
      } else {
        seenEntryIds.add(line.ledgerEntryId);
      }
    }

    lineStates[line.id] = state;

    if (state === 'READY') {
      draft = addFixed(
        draft,
        parseFixed(line.amountPortion.trim(), MONEY_SCALE),
      );
      readyCount += 1;
    } else if (state !== 'BLANK') {
      blocked = true;
    }
  }

  const allocated = addFixed(committed, draft);
  const remaining = subFixed(amount, allocated);
  // Strict `>`, matching the server: equality is the MATCHED case.
  const overAllocated = compareFixed(allocated, amount) > 0;

  return {
    transactionAmount: amount,
    committed,
    draft,
    allocated,
    remaining,
    overAllocated,
    lineStates,
    submittable: readyCount > 0 && !blocked && !overAllocated,
  };
}

/**
 * Builds the batch body. The server commits it in one transaction, so a
 * rejected line rolls back the whole split. Call `summariseDraft` first.
 */
export function toCreateAllocationPayload(
  bankTransactionId: string,
  lines: ReadonlyArray<DraftAllocationLine>,
  lineStates: Record<string, DraftLineState>,
): CreateAllocation {
  const allocations: CreateSingleAllocation[] = lines
    .filter((line) => lineStates[line.id] === 'READY')
    .map((line) => ({
      bankTransactionId,
      ledgerEntryId: line.ledgerEntryId,
      amountPortion: line.amountPortion.trim(),
      idempotencyKey: line.idempotencyKey,
    }));

  return { allocations };
}

/** Renders a Fixed back to the wire/display format. Never used for arithmetic. */
export function toMoneyString(value: Fixed): string {
  return formatFixed(value, MONEY_SCALE);
}

/** Indonesian copy per blocking line state, kept beside the states. */
export const DRAFT_LINE_MESSAGES: Readonly<Record<DraftLineState, string>> = {
  BLANK: '',
  READY: '',
  MISSING_ENTRY: 'Pilih catatan pembukuan terlebih dahulu.',
  MISSING_AMOUNT: 'Isi jumlah alokasi.',
  MALFORMED_AMOUNT: 'Jumlah tidak valid.',
  TOO_MANY_DECIMALS: 'Maksimal 2 angka di belakang koma.',
  NOT_POSITIVE: 'Jumlah harus lebih besar dari 0.',
  DUPLICATE_ENTRY: 'Catatan pembukuan ini sudah dipakai di baris lain.',
};
