import { BusinessProfileService } from './business-profile.service';

describe('BusinessProfileService', () => {
  const profile = {
    id: 'profile-id',
    name: 'OhMyPos',
    logoUrl: null,
    address: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const businessProfile = {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const service = new BusinessProfileService({ businessProfile } as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns existing profile', async () => {
    businessProfile.findFirst.mockResolvedValue(profile);
    await expect(service.getProfile()).resolves.toEqual(profile);
    expect(businessProfile.create).not.toHaveBeenCalled();
  });

  it('creates default profile when missing', async () => {
    businessProfile.findFirst.mockResolvedValue(null);
    businessProfile.create.mockResolvedValue(profile);
    await expect(service.getProfile()).resolves.toEqual(profile);
    expect(businessProfile.create).toHaveBeenCalledWith({
      data: { name: 'OhMyPos' },
    });
  });

  it('updates profile fields', async () => {
    businessProfile.findFirst.mockResolvedValue(profile);
    businessProfile.update.mockResolvedValue({ ...profile, name: 'Warung' });
    await service.updateProfile({ name: 'Warung' });
    expect(businessProfile.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { name: 'Warung' },
    });
  });

  it('updates logo URL', async () => {
    businessProfile.findFirst.mockResolvedValue(profile);
    businessProfile.update.mockResolvedValue({
      ...profile,
      logoUrl: 'https://example.com/logo.png',
    });
    await service.updateLogo('https://example.com/logo.png');
    expect(businessProfile.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { logoUrl: 'https://example.com/logo.png' },
    });
  });
});
