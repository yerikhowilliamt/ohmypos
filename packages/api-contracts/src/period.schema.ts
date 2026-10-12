import { z } from 'zod';
import { DateTimeString } from './primitives';

/** A calendar month, `YYYY-MM`, shared by every period-scoped endpoint. */
export const PeriodMonthString = z
  .string()
  .trim()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])$/,
    'must be a calendar month written as YYYY-MM',
  );
export type PeriodMonthString = z.infer<typeof PeriodMonthString>;

/** Resolved period bounds. `endDate` is exclusive. */
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
