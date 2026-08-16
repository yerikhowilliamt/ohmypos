import { BadRequestException } from '@nestjs/common';

/**
 * OhMyPos — raised by `common/period.ts` when a report range cannot be
 * resolved (ADR-018): malformed date, end before start, or a span wider than
 * MAX_REPORT_RANGE_DAYS. A 400, not a 500 — the client sent it.
 */
export class InvalidReportRangeException extends BadRequestException {
  constructor(reason: string) {
    super(`Invalid report range: ${reason}`);
    this.name = 'InvalidReportRangeException';
  }
}
