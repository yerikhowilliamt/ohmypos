import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class BusinessLogoService {
  constructor() {
    cloudinary.config({
      cloud_name: this.getEnv('CLOUDINARY_CLOUD_NAME'),
      api_key: this.getEnv('CLOUDINARY_API_KEY'),
      api_secret: this.getEnv('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(file: Express.Multer.File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ohmypos/business/logo',
          public_id: 'logo',
          overwrite: true,
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string'
                      ? error
                      : ((error as { message?: string } | undefined)?.message ??
                          'Cloudinary upload returned no result'),
                  ),
            );
            return;
          }
          resolve(result.secure_url);
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  private getEnv(key: string): string {
    return process.env[key] ?? 'change-me';
  }
}
