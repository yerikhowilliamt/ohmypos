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
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type BranchResponse = z.infer<typeof BranchResponseSchema>;
