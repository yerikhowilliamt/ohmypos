import { CreateAllocationSchema } from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateAllocationDto extends createZodDto(CreateAllocationSchema) {}
