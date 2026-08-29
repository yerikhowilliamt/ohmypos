import { ConflictException } from '@nestjs/common';

/**
 * The ADR-014 ledger-attribution row. Since the lookup moved to `isSystem`,
 * renaming it no longer breaks anything — but there is no UI for it either,
 * and letting it be dressed up as a store is the exact confusion this guard
 * exists to prevent. Deleting it still breaks every central purchase.
 */
export class SystemBranchProtectedException extends ConflictException {
  constructor() {
    super('The system location "Umum" cannot be renamed or deleted');
    this.name = 'SystemBranchProtectedException';
  }
}

export class MainStoreProtectedException extends ConflictException {
  constructor(name: string) {
    super(
      `Branch "${name}" is the main store and cannot be deleted while other stores exist`,
    );
    this.name = 'MainStoreProtectedException';
  }
}
