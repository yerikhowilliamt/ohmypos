import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  PlatformAdminChangePassword,
  PlatformAdminLogin,
  PlatformAdminResponse,
} from '@ohmypos/api-contracts';
import * as bcrypt from 'bcrypt';
import {
  PLATFORM_ACCESS_TOKEN_MAX_AGE,
  PLATFORM_REFRESH_TOKEN_MAX_AGE,
} from '../../common/constants/cookie.constants';
import { UnscopedPrismaService } from '../../common/prisma/prisma.service';
import type { PlatformJwtPayload } from '../../common/types/platform-jwt-payload.interface';
import { Prisma, type PlatformAdmin } from '../../generated/prisma/client';
import {
  PLATFORM_ACCOUNT_DEACTIVATED,
  SERVER_MISCONFIGURED,
  SESSION_EXPIRED,
} from '../../common/messages';

export interface PlatformTokens {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 10;

/**
 * Platform admin sessions: the same dual-token, rotating-refresh,
 * `tokenValidFrom` pattern as `AuthService`, on the platform key pair with
 * shorter lifetimes.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    // Unscoped: `PlatformAdmin` has no tenant.
    private readonly prisma: UnscopedPrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    dto: PlatformAdminLogin,
  ): Promise<{ admin: PlatformAdminResponse; tokens: PlatformTokens }> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });

    // Dummy hash so a missing account and a wrong password take the same time.
    const hashToCompare =
      admin?.passwordHash ??
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTU1234567890';
    const isPasswordValid = await bcrypt.compare(dto.password, hashToCompare);

    if (!admin || !isPasswordValid) {
      throw new UnauthorizedException(
        'Email atau kata sandi salah. Periksa kembali kredensial super admin Anda.',
      );
    }

    if (!admin.isActive) {
      throw new UnauthorizedException(PLATFORM_ACCOUNT_DEACTIVATED);
    }

    const tokens = await this.generateTokens(admin);
    await this.storeRefreshToken(admin.id, tokens.refreshToken);

    return { admin: this.toResponse(admin), tokens };
  }

  async refreshTokens(refreshToken: string): Promise<PlatformTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    let payload: PlatformJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<PlatformJwtPayload>(
        refreshToken,
        { secret: this.getSecret('PLATFORM_JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin?.refreshTokenHash || !admin.isActive) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const isValid = await bcrypt.compare(refreshToken, admin.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // Rotate: a stolen copy dies when the real holder refreshes.
    const tokens = await this.generateTokens(admin);
    await this.storeRefreshToken(admin.id, tokens.refreshToken);

    return tokens;
  }

  async logout(adminId: string): Promise<void> {
    try {
      // Bumping tokenValidFrom also invalidates the current access token.
      await this.prisma.platformAdmin.update({
        where: { id: adminId },
        data: { refreshTokenHash: null, tokenValidFrom: new Date() },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return;
      }
      throw error;
    }
  }

  async getProfile(adminId: string): Promise<PlatformAdminResponse> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    return this.toResponse(admin);
  }

  /**
   * Changes the caller's password and revokes every session. Requires the old
   * password. For a forgotten one, see `docs/runbooks/platform-admin-recovery.md`.
   */
  async changePassword(
    adminId: string,
    dto: PlatformAdminChangePassword,
  ): Promise<{ message: string }> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const isValid = await bcrypt.compare(dto.oldPassword, admin.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException(
        'Kata sandi saat ini salah. Coba ketik ulang.',
      );
    }

    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    // Tells the caller to log in again: this call also revoked their own session.
    return {
      message: 'Kata sandi berhasil diperbarui. Silakan masuk kembali.',
    };
  }

  private async generateTokens(
    admin: Pick<PlatformAdmin, 'id' | 'email'>,
  ): Promise<PlatformTokens> {
    const payload: PlatformJwtPayload = { sub: admin.id, email: admin.email };

    // Lifetimes derive from the cookie max-ages so token and cookie cannot drift.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.getSecret('PLATFORM_JWT_SECRET'),
        expiresIn: PLATFORM_ACCESS_TOKEN_MAX_AGE / 1000,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.getSecret('PLATFORM_JWT_REFRESH_SECRET'),
        expiresIn: PLATFORM_REFRESH_TOKEN_MAX_AGE / 1000,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    adminId: string,
    refreshToken: string,
  ): Promise<void> {
    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, BCRYPT_ROUNDS),
      },
    });
  }

  private getSecret(name: string): string {
    const secret = process.env[name];
    if (!secret) {
      // Never name the missing variable to the caller.
      throw new UnauthorizedException(SERVER_MISCONFIGURED);
    }
    return secret;
  }

  private toResponse(admin: PlatformAdmin): PlatformAdminResponse {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }
}
