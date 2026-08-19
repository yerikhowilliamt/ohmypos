import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProfilePhotoService } from './profile-photo.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, ProfilePhotoService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
