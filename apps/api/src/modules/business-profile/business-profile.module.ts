import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { BusinessLogoService } from './business-logo.service';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessProfileService } from './business-profile.service';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessProfileController],
  providers: [BusinessProfileService, BusinessLogoService],
})
export class BusinessProfileModule {}
