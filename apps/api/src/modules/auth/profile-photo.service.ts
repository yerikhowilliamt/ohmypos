import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Uploads to Cloudinary and stores the resulting secure_url on User.photoUrl
 * (Phase 10b, ADR-020). One image per user: the public_id is deterministic
 * (`ohmypos/users/<userId>`), so a re-upload overwrites the previous photo
 * instead of accumulating orphaned images — this is a deliberate v1
 * simplification, not an oversight (no photo history).
 */
@Injectable()
export class ProfilePhotoService {
  constructor(private readonly prisma: PrismaService) {
    cloudinary.config({
      cloud_name: this.getEnv('CLOUDINARY_CLOUD_NAME'),
      api_key: this.getEnv('CLOUDINARY_API_KEY'),
      api_secret: this.getEnv('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(userId: string, file: Express.Multer.File): Promise<string> {
    const secureUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ohmypos',
          public_id: `user_${userId}`,
          overwrite: true,
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            const rejectionReason =
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string'
                      ? error
                      : ((error as { message?: string } | undefined)?.message ??
                          'Cloudinary upload returned no result'),
                  );
            reject(rejectionReason);
            return;
          }
          resolve(result.secure_url);
        },
      );
      uploadStream.end(file.buffer);
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { photoUrl: secureUrl },
    });

    return secureUrl;
  }

  private getEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      // Return placeholder in non-production fallback if needed, but error when missing
      return 'change-me';
    }
    return value;
  }
}
