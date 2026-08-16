import { ConflictException } from '@nestjs/common';

/**
 * OhMyPos — Supplier domain exceptions (Playbook §6, plan §9.8).
 *
 * - SupplierNameTakenException (409) — triggered on P2002 on Supplier.name
 * - SupplierInUseException (409) — triggered on P2003 on deleting a referenced supplier
 *
 * `this.name` is set on each, matching `raw-materials.exceptions.ts` and
 * `users.exceptions.ts`.
 */

export class SupplierNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Supplier with name "${name}" already exists`);
    this.name = 'SupplierNameTakenException';
  }
}

export class SupplierInUseException extends ConflictException {
  constructor(id: string) {
    super(
      `Supplier with ID ${id} cannot be deleted because it is referenced by existing purchases or payables`,
    );
    this.name = 'SupplierInUseException';
  }
}
