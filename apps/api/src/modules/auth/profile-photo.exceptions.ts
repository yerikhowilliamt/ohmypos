import { BadRequestException } from '@nestjs/common';

/** Domain exceptions for profile photo upload (Phase 10b, Playbook §6). */
export class InvalidImageFileException extends BadRequestException {
  constructor() {
    super('Format gambar harus JPG, PNG, atau WebP.');
    this.name = 'InvalidImageFileException';
  }
}
