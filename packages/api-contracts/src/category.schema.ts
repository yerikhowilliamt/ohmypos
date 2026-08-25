import { z } from 'zod';
import { TransactionType } from './enums';
import { UuidString } from './primitives';

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: TransactionType,
});
export type CreateCategory = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CreateCategorySchema.partial();
export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;

export const CategoryResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  type: TransactionType,
  isSystem: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;
