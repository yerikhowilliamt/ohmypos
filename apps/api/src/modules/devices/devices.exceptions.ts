import { BadRequestException, NotFoundException } from '@nestjs/common';

/** Domain exceptions for the Devices module (Playbook §6). */

export class InvalidActivationCodeException extends NotFoundException {
  constructor() {
    super('Activation code is invalid or has already been used');
    this.name = 'InvalidActivationCodeException';
  }
}

export class ActivationCodeExpiredException extends BadRequestException {
  constructor() {
    super('Activation code has expired — generate a new one');
    this.name = 'ActivationCodeExpiredException';
  }
}
