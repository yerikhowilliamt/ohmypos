import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, AttendanceService],
  exports: [DevicesService, AttendanceService],
})
export class DevicesModule {}
