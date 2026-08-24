/**
 * OhMyPos — split-allocation draft arithmetic (PRD §5.7, DESIGN.md §12.3 Bank Reconciliation Split-Allocation).
 *
 * The invariant this file guards is `sum(Allocation.amountPortion) <=
 * BankTransaction.amount` over ACTIVE rows only (ERD §2). It is enforced for
 * real in two places — `AllocationService.create`'s Decimal check and the
 * `trg_check_allocation_sum` trigger's FOR UPDATE check (Playbook §7). This
 * module is neither of them: it exists so the operator sees the running total
 * while building the split instead of discovering the problem after a 400.
 *
 * Two rules copied verbatim from the backend, and deliberately not "improved":
 *
 * 1. The cap is a STRICT `>` comparison (`allocation.service.ts:105`, and `>`
 *    in the trigger). Allocating exactly the full amount is the success case —
 *    it is what turns the transaction MATCHED (allocation-sum.e2e-spec.ts:120).
 *    Blocking at `>=` would make every full allocation impossible.
 * 2. Only ACTIVE allocations count. REVOKED rows are invisible to the sum
 *    (`allocation.service.ts:61`), so revoking frees the amount again
 *    (allocation-sum.e2e-spec.ts:203).
 *
 * All arithmetic goes through lib/decimal.ts's BigInt-backed `Fixed`. Never
 * `Number` — money is never floating point (Playbook §5).
 */
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
 * One row the operator is building. `id` is stable for React and for input
 * focus; `idempotencyKey` is regenerated on every edit.
 *
 * Why two ids: `AllocationService.create` resolves items whose idempotencyKey
 * already exists for that transaction and returns them WITHOUT creating a new
 * row, excluding them from the cap arithmetic (allocation.service.ts:67-100).
 * That makes replaying a timed-out submit safe — but it also means resubmitting
 * an EDITED line under its old key would silently keep the old amount. Rotating
 * the key on edit keeps both properties: retry-unchanged is idempotent, and
 * retry-after-edit is a genuinely new allocation.
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
  /** committed + draft — the "Allocated" figure of DESIGN.md §12.3 Bank Reconciliation Split-Allocation. */
  allocated: Fixed;
  /** transactionAmount − allocated. Negative when over-allocated. */
  remaining: Fixed;
  /** True when `allocated > transactionAmount` — a STRICT comparison. */
  overAllocated: boolean;
  /** Per-line state, keyed by DraftAllocationLine.id. */
  lineStates: Record<string, DraftLineState>;
  /** At least one READY line and nothing blocking. */
  submittable: boolean;
}

/** Mirrors MoneyString's shape check (packages/api-contracts/src/primitives.ts:15). */
const MONEY_PATTERN = /^\d+(?:\.\d+)?$/;

/** Mirrors MoneyString's scale refinement — Decimal(18,2), so at most 2 dp. */
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

  // `AllocationService.create` rejects amountPortion <= 0 outright
  // (allocation.service.ts:94), so '0' and '0.00' are blocking, not merely odd.
  if (compareFixed(parseFixed(amount, MONEY_SCALE), zero(MONEY_SCALE)) <= 0) {
    return 'NOT_POSITIVE';
  }

  return 'READY';
}

/**
 * Σ of the ACTIVE portion of the persisted allocations. REVOKED rows are
 * excluded exactly as the backend excludes them.
 */
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

    // Two rows against the same LedgerEntry on the same BankTransaction is
    // always operator error — the fix is to edit one line's amount. Note this
    // is a UI rule, not a backend one: the only uniqueness constraint on
    // Allocation is (bankTransactionId, idempotencyKey) (ERD §6), and nothing
    // server-side caps allocations per ledger entry. See the Tech Debt Log.
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
  // STRICT `>`, matching `totalSum.gt(txnAmount)` — equality is the MATCHED case.
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
 * Builds the batch request body. Uses Kasync's `allocations` array form, which
 * `AllocationService.create` flattens and commits inside ONE prisma.$transaction
 * (allocation.service.ts:39) — so a rejected line rolls the whole split back
 * and the operator never has to clean up half a submission.
 *
 * BLANK and invalid lines are dropped; call `summariseDraft` first and only
 * submit when `submittable` is true.
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

/**
 * Indonesian, operator-facing copy for each blocking line state. Kept next to
 * the states so a new state cannot be added without a message.
 */
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
