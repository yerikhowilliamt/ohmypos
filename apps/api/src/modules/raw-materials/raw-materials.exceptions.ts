/**
 * OhMyPos — domain exceptions for the RawMaterials module (Playbook §6, ERD §3).
 */
import { ConflictException } from '@nestjs/common';

export class RawMaterialNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Raw material with name "${name}" already exists`);
    this.name = 'RawMaterialNameTakenException';
  }
}

export class RawMaterialInUseException extends ConflictException {
  constructor(id: string) {
    super(
      `Raw material with ID ${id} cannot be deleted because it is used in one or more product recipes`,
    );
    this.name = 'RawMaterialInUseException';
  }
}
