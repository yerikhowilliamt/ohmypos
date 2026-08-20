import {
  ActivateDeviceSchema,
  AttendanceQuerySchema,
  CreateDeviceSchema,
  UpdateAttendanceStatusSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateDeviceDto extends createZodDto(CreateDeviceSchema) {}
export class ActivateDeviceDto extends createZodDto(ActivateDeviceSchema) {}
export class AttendanceQueryDto extends createZodDto(AttendanceQuerySchema) {}
export class UpdateAttendanceStatusDto extends createZodDto(
  UpdateAttendanceStatusSchema,
) {}
