/**
 * OhMyPos — domain exceptions for the Products module (Playbook §6, ERD §3).
 */
import { ConflictException } from '@nestjs/common';

export class ProductNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Product with name "${name}" already exists`);
    this.name = 'ProductNameTakenException';
  }
}

/**
 * Phase 5, plan §9.4 decision 8: `SaleItem → Product` is `Restrict`, so once a
 * product has been sold, deleting it hits Postgres FK constraint P2003. Mapped
 * here rather than left as a raw 500 — the predictable Phase 5 counterpart to
 * ERR-004, this time anticipated instead of discovered.
 */
export class ProductInUseException extends ConflictException {
  constructor(id: string) {
    super(
      `Product with ID ${id} cannot be deleted because it has been sold in one or more sales`,
    );
    this.name = 'ProductInUseException';
  }
}
