import {
  CreateRawMaterialSchema,
  UpdateRawMaterialSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateRawMaterialDto extends createZodDto(
  CreateRawMaterialSchema,
) {}
export class UpdateRawMaterialDto extends createZodDto(
  UpdateRawMaterialSchema,
) {}
