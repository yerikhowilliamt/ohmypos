import { z } from 'zod';
import { MoneyString, UuidString } from './primitives';

export const MatchType = z.enum(['EXACT', 'FUZZY', 'AGGREGATION']);
export type MatchType = z.infer<typeof MatchType>;

export const ProposeMatchesSchema = z.object({
  accountId: UuidString.optional(),
  dateToleranceDays: z.coerce.number().int().min(0).max(30).optional(),
  maxAggregationSubsetSize: z.coerce.number().int().min(2).max(6).optional(),
  maxCandidates: z.coerce.number().int().min(1).max(200).optional(),
});
export type ProposeMatches = z.infer<typeof ProposeMatchesSchema>;

export const ResetMatchesSchema = z.object({
  accountId: UuidString.optional(),
});
export type ResetMatches = z.infer<typeof ResetMatchesSchema>;

export const MatchCandidateSchema = z.object({
  matchType: MatchType,
  confidence: z.number(),
  bankTransactionIds: z.array(UuidString),
  ledgerEntryId: UuidString,
  matchedAmount: MoneyString,
  dateDifferenceDays: z.number().int(),
});
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;
