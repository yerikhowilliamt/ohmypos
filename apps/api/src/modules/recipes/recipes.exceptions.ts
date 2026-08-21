/**
 * OhMyPos — domain exceptions for the Recipes module (Playbook §6, ERD §3).
 */
import { BadRequestException } from '@nestjs/common';

export class UnknownRawMaterialException extends BadRequestException {
  constructor(missingIds: string[]) {
    super(
      `The following rawMaterialId(s) do not exist: ${missingIds.join(', ')}`,
    );
    this.name = 'UnknownRawMaterialException';
  }
}
