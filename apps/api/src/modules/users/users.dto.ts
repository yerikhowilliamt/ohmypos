import {
  CreateUserSchema,
  ResetUserPasswordSchema,
  UpdateUserSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class ResetUserPasswordDto extends createZodDto(
  ResetUserPasswordSchema,
) {}
