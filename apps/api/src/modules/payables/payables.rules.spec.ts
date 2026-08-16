/**
 * OhMyPos — unit tests for the payable settlement rule (ADR-006, plan §9.6, §9.10).
 *
 * Playbook §10 puts the Payable/PayableSettlement flow in the "must have
 * thorough tests" tier. Over-settlement and already-settled are the two ways
 * this rule can be wrong, and both are checked here without a database —
 * the row lock that makes them hold under concurrency is covered separately by
 * Case 8 in `test/purchasing-payables.e2e-spec.ts`.
 */
import { Prisma } from '../../generated/prisma/client';
import {
  PayableAlreadySettledException,
  SettlementExceedsPayableException,
} from './payables.exceptions';
import { assertSettlable } from './payables.rules';

describe('Payable Settlement Rules (payables.rules.ts)', () => {
  it('allows partial settlement when amount is less than remaining balance', () => {
    expect(() =>
      assertSettlable(
        'OPEN',
        new Prisma.Decimal('60000.00'),
        new Prisma.Decimal('20000.00'),
      ),
    ).not.toThrow();
  });

  it('allows full settlement when amount exactly equals remaining balance', () => {
    expect(() =>
      assertSettlable(
        'PARTIALLY_SETTLED',
        new Prisma.Decimal('40000.00'),
        new Prisma.Decimal('40000.00'),
      ),
    ).not.toThrow();
  });

  it('throws SettlementExceedsPayableException when amount exceeds remaining balance', () => {
    expect(() =>
      assertSettlable(
        'OPEN',
        new Prisma.Decimal('60000.00'),
        new Prisma.Decimal('60000.01'),
      ),
    ).toThrow(SettlementExceedsPayableException);
  });

  it('throws PayableAlreadySettledException when status is SETTLED even for tiny amounts', () => {
    expect(() =>
      assertSettlable(
        'SETTLED',
        new Prisma.Decimal('0.00'),
        new Prisma.Decimal('0.01'),
      ),
    ).toThrow(PayableAlreadySettledException);
  });

  it('throws PayableAlreadySettledException when remaining balance is 0 or negative even if status is not SETTLED', () => {
    expect(() =>
      assertSettlable(
        'PARTIALLY_SETTLED',
        new Prisma.Decimal('0.00'),
        new Prisma.Decimal('100.00'),
      ),
    ).toThrow(PayableAlreadySettledException);
  });

  it('allows minimal valid settlement (0.01 against 0.01)', () => {
    expect(() =>
      assertSettlable(
        'OPEN',
        new Prisma.Decimal('0.01'),
        new Prisma.Decimal('0.01'),
      ),
    ).not.toThrow();
  });
});
