/**
 * OhMyPos — Sales domain exceptions (Playbook §6, plan §10.5).
 *
 * - SaleProductNotFoundException (404) — an id in the cart does not exist.
 * - InactiveProductException (409) — the product exists but is not sellable
 *   right now; a state conflict, same reasoning as PayableAlreadySettledException.
 * - RecipeIncompleteException (409) — Playbook §6 names this exception
 *   explicitly: "a product has no recipe defined, so HPP can't be computed".
 *   `calculateHpp([])` returns `null` by design (ADR-013); selling at
 *   `hppAtSale = 0` would silently report 100% margin forever.
 * - CentralBranchNotSellableException (400) — the payload names something that
 *   may never be named there, mirroring CentralBranchNotAssignableException.
 *
 * `this.name` is set on each, matching every other `*.exceptions.ts` in the repo.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CENTRAL_BRANCH_NAME } from '../../common/system-refs';

export class SaleProductNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(`Product(s) not found: ${missingIds.join(', ')}`);
    this.name = 'SaleProductNotFoundException';
  }
}

export class InactiveProductException extends ConflictException {
  constructor(names: string[]) {
    super(`Product(s) are inactive and cannot be sold: ${names.join(', ')}`);
    this.name = 'InactiveProductException';
  }
}

export class RecipeIncompleteException extends ConflictException {
  constructor(names: string[]) {
    super(
      `Product(s) have no recipe defined, so HPP cannot be computed: ${names.join(', ')}`,
    );
    this.name = 'RecipeIncompleteException';
  }
}

/**
 * ADR-014/ADR-015: `Pusat (Dapur Sentral)` is a ledger-attribution row, not a
 * till — there is no such thing as a central sale (ADR-004). A sale attributed
 * to it would appear in branch reports as an outlet that never sold anything.
 */
export class CentralBranchNotSellableException extends BadRequestException {
  constructor() {
    super(
      `A sale cannot be recorded at the system branch "${CENTRAL_BRANCH_NAME}" — a sale always happens at a real outlet (ADR-015)`,
    );
    this.name = 'CentralBranchNotSellableException';
  }
}
