import { ReplaceRecipeSchema } from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class ReplaceRecipeDto extends createZodDto(ReplaceRecipeSchema) {}
