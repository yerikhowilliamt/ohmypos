import { BadRequestException, ConflictException } from '@nestjs/common';

/** `branchId` is required for KASIR and forbidden for ADMIN/OWNER (ADR-011). */
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
