import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CENTRAL_BRANCH_NAME } from '../../common/system-refs';

/**
 * OhMyPos — SupplierPurchases domain exceptions (Playbook §6, plan §9.8).
 *
 * - PurchaseItemMaterialNotFoundException (404)
 * - CentralBranchNotAssignableException (400)
 *
 * `this.name` is set on each, matching `raw-materials.exceptions.ts` and
 * `users.exceptions.ts` — the class name is what identifies the broken rule in
 * a log line, and the inherited default would just say `BadRequestException`.
 */

export class PurchaseItemMaterialNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(`Raw material(s) not found: ${missingIds.join(', ')}`);
    this.name = 'PurchaseItemMaterialNotFoundException';
  }
}

/**
 * ADR-014: the `Pusat (Dapur Sentral)` branch exists only so a central
 * purchase's generated `LedgerEntry` can satisfy `LedgerEntry.branchId`'s NOT
 * NULL. It is not a sales outlet, and a purchase attributed to it directly
 * would report `isCentral: false` for something that is in fact central —
 * quietly wrong in every branch-grouped report. `branchId: null` stays the one
 * way to record a central purchase.
 */
export class CentralBranchNotAssignableException extends BadRequestException {
  constructor() {
    super(
      `A purchase cannot be assigned to the system branch "${CENTRAL_BRANCH_NAME}" — send branchId: null to record a central purchase (ADR-014)`,
    );
    this.name = 'CentralBranchNotAssignableException';
  }
}
