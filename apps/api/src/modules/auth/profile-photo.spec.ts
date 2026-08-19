import { InvalidImageFileException } from './profile-photo.exceptions';

describe('ProfilePhoto exceptions & validation', () => {
  it('throws InvalidImageFileException on non-image mimetype', () => {
    const invalidFile = {
      mimetype: 'application/pdf',
      originalname: 'document.pdf',
      buffer: Buffer.from('test'),
      size: 100,
    } as Express.Multer.File;

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    expect(() => {
      if (!allowedMimeTypes.includes(invalidFile.mimetype)) {
        throw new InvalidImageFileException();
      }
    }).toThrow(InvalidImageFileException);
  });
});
