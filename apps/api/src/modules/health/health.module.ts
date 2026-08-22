import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

// PrismaService needs no explicit import here — PrismaModule is @Global().
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
