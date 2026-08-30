import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
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
 * ADR-025 Fase 4 — the same dual-token, rotating-refresh, `tokenValidFrom`
 * pattern `AuthService` uses (ADR-011 §3), against `platform_admins` and the
 * platform key pair.
 *
 * Shorter lifetimes than the tenant session on purpose (TASK-125): one session
 * here reaches every tenant in the system.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    // Unscoped throughout: `PlatformAdmin` has no tenant, and platform routes
    // deliberately run with `scope.tenantId` null.
    private readonly prisma: UnscopedPrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    dto: PlatformAdminLogin,
  ): Promise<{ admin: PlatformAdminResponse; tokens: PlatformTokens }> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });

    // Same dummy-hash comparison as AuthService.login, so a missing account and
    // a wrong password take the same time.
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

    // Rotation, as on the tenant side: the presented token is replaced, so a
    // stolen copy stops working the moment the real holder refreshes.
    const tokens = await this.generateTokens(admin);
    await this.storeRefreshToken(admin.id, tokens.refreshToken);

    return tokens;
  }

  async logout(adminId: string): Promise<void> {
    try {
      // Bumping tokenValidFrom kills the access token too, not just the
      // refresh token — PlatformAuthGuard checks it on every request.
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

  private async generateTokens(
    admin: Pick<PlatformAdmin, 'id' | 'email'>,
  ): Promise<PlatformTokens> {
    const payload: PlatformJwtPayload = { sub: admin.id, email: admin.email };

    // The token lifetimes are derived from the cookie max-ages rather than read
    // from env, so the two cannot drift apart — a cookie that outlives its
    // token produces a session that looks live and 401s on every call. It also
    // sidesteps the `${number}d` cast `AuthService` needs, because `expiresIn`
    // takes a plain number of seconds.
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
      // Naming the variable to an anonymous caller is a leak and is not
      // something they can act on (see the note in `common/messages.ts`).
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
