import { CreateBranchSchema, UpdateBranchSchema } from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateBranchDto extends createZodDto(CreateBranchSchema) {}
export class UpdateBranchDto extends createZodDto(UpdateBranchSchema) {}
