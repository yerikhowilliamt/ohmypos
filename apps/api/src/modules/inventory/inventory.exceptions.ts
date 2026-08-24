/**
 * OhMyPos — Inventory domain exceptions (Playbook §6, Phase 6 plan §11.10).
 *
 * - OpeningStockRawMaterialNotFoundException (404) — an id in `entries` does
 *   not exist. It extends NotFoundException, and that is not incidental:
 *   ERR-005 records this exact exception family extending the wrong base class
 *   and returning 400 for a missing row.
 * - OpeningStockUnitPriceRequiredException / NotAllowed (400) — the payload is
 *   malformed against PRD §5.5's conditional rule; the client can fix it and
 *   retry, so it is a bad request, not a conflict.
 * - OpeningStockWouldGoNegativeException (409) — the payload is well-formed but
 *   conflicts with the current state of the stock pool, exactly like
 *   InsufficientStockException.
 * - FuturePeriodNotAllowedException / InvalidPeriodException (400).
 *
 * `this.name` is set on each, matching every other `*.exceptions.ts` in the repo.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export class OpeningStockRawMaterialNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(`Raw material(s) not found: ${missingIds.join(', ')}`);
    this.name = 'OpeningStockRawMaterialNotFoundException';
  }
}

export class OpeningStockUnitPriceRequiredException extends BadRequestException {
  constructor(names: string[]) {
    super(
      `unitPrice is required for material(s) with no purchase recorded in this period: ${names.join(', ')}`,
    );
    this.name = 'OpeningStockUnitPriceRequiredException';
  }
}

export class OpeningStockUnitPriceNotAllowedException extends BadRequestException {
  constructor(names: string[]) {
    super(
      `unitPrice must be omitted for material(s) already purchased in this period: ${names.join(', ')}`,
    );
    this.name = 'OpeningStockUnitPriceNotAllowedException';
  }
}

export class OpeningStockWouldGoNegativeException extends ConflictException {
  constructor(
    offenders: {
      name: string;
      delta: Prisma.Decimal;
      resultingStock: Prisma.Decimal;
    }[],
  ) {
    super(
      `Opening stock would drive the stock pool negative: ${offenders
        .map(
          (offender) =>
            `${offender.name} (koreksi ${offender.delta.toFixed(4)}, hasil ${offender.resultingStock.toFixed(4)})`,
        )
        .join('; ')}`,
    );
    this.name = 'OpeningStockWouldGoNegativeException';
  }
}

export class FuturePeriodNotAllowedException extends BadRequestException {
  constructor(month: string) {
    super(
      `Period ${month} has not started yet — opening stock is recorded at the start of a month, never in advance`,
    );
    this.name = 'FuturePeriodNotAllowedException';
  }
}

export class InvalidPeriodException extends BadRequestException {
  constructor(period: string) {
    super(`Invalid period "${period}" — expected a calendar month as YYYY-MM`);
    this.name = 'InvalidPeriodException';
  }
}
