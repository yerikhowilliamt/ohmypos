import { BadRequestException } from '@nestjs/common';

/** A report range that cannot be resolved (400). */
export class InvalidReportRangeException extends BadRequestException {
  constructor(reason: string) {
    super(`Invalid report range: ${reason}`);
    this.name = 'InvalidReportRangeException';
  }
}
