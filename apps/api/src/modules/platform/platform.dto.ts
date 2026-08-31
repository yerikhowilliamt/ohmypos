import {
  CreateTenantSchema,
  PaginationQuerySchema,
  PlatformAdminChangePasswordSchema,
  PlatformAdminLoginSchema,
  ResetTenantOwnerPasswordSchema,
  StartImpersonationSchema,
  UpdateTenantOwnerEmailSchema,
  UpdateTenantSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class PlatformAdminLoginDto extends createZodDto(
  PlatformAdminLoginSchema,
) {}
export class PlatformAdminChangePasswordDto extends createZodDto(
  PlatformAdminChangePasswordSchema,
) {}
export class CreateTenantDto extends createZodDto(CreateTenantSchema) {}
export class UpdateTenantDto extends createZodDto(UpdateTenantSchema) {}
export class StartImpersonationDto extends createZodDto(
  StartImpersonationSchema,
) {}
export class ResetTenantOwnerPasswordDto extends createZodDto(
  ResetTenantOwnerPasswordSchema,
) {}
export class UpdateTenantOwnerEmailDto extends createZodDto(
  UpdateTenantOwnerEmailSchema,
) {}
export class TenantListQueryDto extends createZodDto(PaginationQuerySchema) {}
