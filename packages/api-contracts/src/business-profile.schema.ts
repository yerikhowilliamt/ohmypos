import { z } from 'zod';
import { UuidString } from './primitives';

export const BusinessProfileResponseSchema = z.object({
  id: UuidString,
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().nullable(),
  address: z.string().nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type BusinessProfileResponse = z.infer<
  typeof BusinessProfileResponseSchema
>;

export const UpdateBusinessProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama bisnis wajib diisi')
    .max(120, 'Maksimal 120 karakter')
    .optional(),
  address: z
    .string()
    .trim()
    .max(500, 'Maksimal 500 karakter')
    .nullable()
    .optional(),
});
export type UpdateBusinessProfile = z.infer<typeof UpdateBusinessProfileSchema>;
