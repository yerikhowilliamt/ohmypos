import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Domain exceptions for the User module (Playbook §6). Raised instead of bare
 * framework exceptions so the rule being broken is named at the throw site.
 */

/** ADR-011 §2 — branchId is required for KASIR and forbidden for ADMIN/OWNER. */
export class InvalidRoleBranchAssignmentException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoleBranchAssignmentException';
  }
}

export class EmailAlreadyRegisteredException extends ConflictException {
  constructor(email: string) {
    super(`Email ${email} sudah terdaftar. Pakai alamat email lain.`);
    this.name = 'EmailAlreadyRegisteredException';
  }
}
