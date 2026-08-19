import { BadRequestException } from '@nestjs/common';

/** Domain exceptions for profile photo upload (Phase 10b, Playbook §6). */
export class InvalidImageFileException extends BadRequestException {
  constructor() {
    super('File must be a JPEG, PNG, or WebP image');
    this.name = 'InvalidImageFileException';
  }
}
