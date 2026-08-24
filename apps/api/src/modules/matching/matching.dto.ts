import {
  ProposeMatchesSchema,
  ResetMatchesSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class ProposeMatchesDto extends createZodDto(ProposeMatchesSchema) {}
export class ResetMatchesDto extends createZodDto(ResetMatchesSchema) {}
