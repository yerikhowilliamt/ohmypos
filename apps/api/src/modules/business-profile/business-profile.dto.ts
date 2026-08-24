import {
  BusinessProfileResponseSchema,
  UpdateBusinessProfileSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateBusinessProfileDto extends createZodDto(
  UpdateBusinessProfileSchema,
) {}
export class BusinessProfileResponseDto extends createZodDto(
  BusinessProfileResponseSchema,
) {}
