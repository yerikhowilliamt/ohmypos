import { Injectable, NotFoundException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Uploads product photo to Cloudinary and stores the resulting secure_url on Product.photoUrl.
 * Deterministic public_id (`ohmypos/product_<productId>`) with overwrite: true to prevent orphans.
 */
@Injectable()
export class ProductPhotoService {
  constructor(private readonly prisma: PrismaService) {
    cloudinary.config({
      cloud_name: this.getEnv('CLOUDINARY_CLOUD_NAME'),
      api_key: this.getEnv('CLOUDINARY_API_KEY'),
      api_secret: this.getEnv('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(productId: string, file: Express.Multer.File): Promise<string> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(
        'Produk tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    const secureUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ohmypos',
          public_id: `product_${productId}`,
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

    await this.prisma.product.update({
      where: { id: productId },
      data: { photoUrl: secureUrl },
    });

    return secureUrl;
  }

  private getEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      return 'change-me';
    }
    return value;
  }
}
