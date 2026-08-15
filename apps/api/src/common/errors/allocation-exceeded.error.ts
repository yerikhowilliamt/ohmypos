export interface AllocationExceededErrorDetails {
  message: string;
  txnId?: string;
  attempted?: string;
  max?: string;
}

/**
 * Raised when the `trg_check_allocation_sum` database trigger rejects an
 * allocation because it would push the total past the bank transaction's
 * amount. Ported unchanged from Kasync.
 */
export class AllocationExceededError extends Error {
  public readonly txnId?: string;
  public readonly attempted?: string;
  public readonly max?: string;

  constructor(details: AllocationExceededErrorDetails) {
    super(details.message);
    this.name = 'AllocationExceededError';
    this.txnId = details.txnId;
    this.attempted = details.attempted;
    this.max = details.max;
  }
}
