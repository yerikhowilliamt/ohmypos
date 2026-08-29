import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessLogoService } from './business-logo.service';
import { UpdateBusinessProfileDto } from './business-profile.dto';
import { BusinessProfileService } from './business-profile.service';

@Controller('business-profile')
export class BusinessProfileController {
  constructor(
    private readonly service: BusinessProfileService,
    private readonly logoService: BusinessLogoService,
  ) {}

  @Get()
  getProfile() {
    return this.service.getProfile();
  }

  @Patch()
  @Roles('OWNER')
  updateProfile(@Body() dto: UpdateBusinessProfileDto) {
    return this.service.updateProfile(dto);
  }

  @Post('logo')
  @Roles('OWNER')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.',
            ),
            false,
          );
        }
      },
    }),
  )
  async updateLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file)
      throw new BadRequestException('Pilih berkas gambar terlebih dahulu.');
    const logoUrl = await this.logoService.upload(file);
    return this.service.updateLogo(logoUrl);
  }
}
