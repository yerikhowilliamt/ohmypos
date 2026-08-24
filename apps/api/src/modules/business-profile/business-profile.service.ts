import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateBusinessProfileDto } from './business-profile.dto';

@Injectable()
export class BusinessProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile() {
    return (
      (await this.prisma.businessProfile.findFirst()) ??
      this.prisma.businessProfile.create({ data: { name: 'OhMyPos' } })
    );
  }

  async updateProfile(dto: UpdateBusinessProfileDto) {
    const profile = await this.getProfile();
    return this.prisma.businessProfile.update({
      where: { id: profile.id },
      data: dto,
    });
  }

  async updateLogo(logoUrl: string) {
    const profile = await this.getProfile();
    return this.prisma.businessProfile.update({
      where: { id: profile.id },
      data: { logoUrl },
    });
  }
}
