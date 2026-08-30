import {
  CreateTenantSchema,
  PaginationQuerySchema,
  PlatformAdminLoginSchema,
  StartImpersonationSchema,
  UpdateTenantSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class PlatformAdminLoginDto extends createZodDto(
  PlatformAdminLoginSchema,
) {}
export class CreateTenantDto extends createZodDto(CreateTenantSchema) {}
export class UpdateTenantDto extends createZodDto(UpdateTenantSchema) {}
export class StartImpersonationDto extends createZodDto(
  StartImpersonationSchema,
) {}
export class TenantListQueryDto extends createZodDto(PaginationQuerySchema) {}
