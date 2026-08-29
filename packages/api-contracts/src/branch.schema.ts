import { z } from 'zod';
import { UuidString } from './primitives';

export const CreateBranchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(500).nullish(),
});
export type CreateBranch = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = CreateBranchSchema.partial();
export type UpdateBranch = z.infer<typeof UpdateBranchSchema>;

export const BranchResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  address: z.string().nullable(),
  /**
   * ADR-014 ledger-attribution row: a scope ("not tied to any one store"), not
   * a place. Hidden from the store list and from the cashier branch picker;
   * shown in reports, where its cost genuinely belongs.
   */
  isSystem: z.boolean(),
  /** The Owner's first store. Exactly one non-system branch carries this. */
  isMainStore: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type BranchResponse = z.infer<typeof BranchResponseSchema>;
