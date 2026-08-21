import {
  ChangePasswordSchema,
  LoginSchema,
  UpdateSelfSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(LoginSchema) {}
export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
export class UpdateSelfDto extends createZodDto(UpdateSelfSchema) {}
