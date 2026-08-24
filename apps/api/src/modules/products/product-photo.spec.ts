import { NotFoundException } from '@nestjs/common';
import { ProductPhotoService } from './product-photo.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ProductPhotoService', () => {
  let service: ProductPhotoService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    service = new ProductPhotoService(prisma);
  });

  it('throws NotFoundException if product does not exist', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

    const mockFile = {
      buffer: Buffer.from('fake-image-data'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    await expect(service.upload('non-existent-id', mockFile)).rejects.toThrow(
      NotFoundException,
    );
  });
});
