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
