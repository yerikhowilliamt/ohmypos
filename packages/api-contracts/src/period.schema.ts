import { z } from 'zod';
import { DateTimeString } from './primitives';

/**
 * OhMyPos — the shared calendar-period contract (Phase 6 plan §9).
 *
 * A period is a calendar month, written `YYYY-MM`. It lives in its own file
 * because Dashboard 5 (Phase 6) and Dashboard 3 (Phase 7) take the identical
 * parameter, and defining it twice is how two report screens end up disagreeing
 * about where a month ends.
 */
export const PeriodMonthString = z
  .string()
  .trim()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])$/,
    'must be a calendar month written as YYYY-MM',
  );
export type PeriodMonthString = z.infer<typeof PeriodMonthString>;

/**
 * The resolved boundaries of a period, echoed on every period-scoped response.
 * `endDate` is EXCLUSIVE — stated in the payload so a client never has to guess
 * whether the last instant of the month is inside or outside.
 */
export const PeriodResponseSchema = z.object({
  month: PeriodMonthString,
  startDate: DateTimeString,
  endDate: DateTimeString,
});
export type PeriodResponse = z.infer<typeof PeriodResponseSchema>;

/** Query shape for every period-scoped GET in the inventory module. */
export const PeriodQuerySchema = z.object({
  period: PeriodMonthString,
});
export type PeriodQuery = z.infer<typeof PeriodQuerySchema>;
