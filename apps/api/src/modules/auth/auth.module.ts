import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DevicesModule } from '../devices/devices.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProfilePhotoService } from './profile-photo.service';

@Module({
  imports: [JwtModule.register({}), DevicesModule],
  controllers: [AuthController],
  providers: [AuthService, ProfilePhotoService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
