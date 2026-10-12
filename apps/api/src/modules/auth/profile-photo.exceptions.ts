import { BadRequestException } from '@nestjs/common';

export class InvalidImageFileException extends BadRequestException {
  constructor() {
    super('Format gambar harus JPG, PNG, atau WebP.');
    this.name = 'InvalidImageFileException';
  }
}
