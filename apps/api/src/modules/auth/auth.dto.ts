import { ChangePasswordSchema, LoginSchema } from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(LoginSchema) {}
export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
