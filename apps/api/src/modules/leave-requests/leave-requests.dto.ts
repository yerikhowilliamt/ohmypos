import {
  CreateLeaveRequestSchema,
  LeaveRequestListQuerySchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateLeaveRequestDto extends createZodDto(
  CreateLeaveRequestSchema,
) {}
export class LeaveRequestListQueryDto extends createZodDto(
  LeaveRequestListQuerySchema,
) {}
