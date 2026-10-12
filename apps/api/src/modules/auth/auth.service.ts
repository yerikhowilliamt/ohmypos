import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  ChangePassword,
  Login,
  LoginResponse,
  SessionResponse,
  UpdateSelf,
  UserResponse,
} from '@ohmypos/api-contracts';
import * as bcrypt from 'bcrypt';
import {
  PrismaService,
  UnscopedPrismaService,
} from '../../common/prisma/prisma.service';
import { adoptTenantScope } from '../../common/prisma/tenant-context';
import { Prisma } from '../../generated/prisma/client';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AttendanceService } from '../devices/attendance.service';
import { LastActiveOwnerException } from './auth.exceptions';
import {
  ACCOUNT_DEACTIVATED,
  SERVER_MISCONFIGURED,
  SESSION_EXPIRED,
} from '../../common/messages';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 10;

/**
 * Tenant user sessions: access + rotating refresh tokens, revoked through
 * `tokenValidFrom` (ADR-011).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    /** Unscoped only to find the user (and so the tenant) at login and refresh. */
    private readonly unscopedPrisma: UnscopedPrismaService,
    private readonly jwtService: JwtService,
    private readonly attendanceService: AttendanceService,
  ) {}

  async login(
    dto: Login,
    deviceCookieValue: string | undefined,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: LoginResponse; tokens: AuthTokens }> {
    const user = await this.unscopedPrisma.user.findUnique({
      where: { email: dto.email },
    });
    if (user) {
      adoptTenantScope(user.tenantId);
    }

    // Dummy hash so a missing account and a wrong password take the same time.
    const hashToCompare =
      user?.passwordHash ??
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTU1234567890';
    const isPasswordValid = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || !isPasswordValid) {
      // Never reveal which of the two is wrong.
      throw new UnauthorizedException(
        'Email atau kata sandi salah. Periksa kembali, atau minta Owner mengatur ulang kata sandi Anda.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(ACCOUNT_DEACTIVATED);
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    // Device tracking applies to KASIR only.
    const attendance =
      user.role === 'KASIR'
        ? await this.attendanceService.checkAndRecord(
            { id: user.id, branchId: user.branchId },
            deviceCookieValue,
            meta,
          )
        : null;

    return { user: { ...this.toResponse(user), attendance }, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.getSecret('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const user = await this.unscopedPrisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (user) {
      adoptTenantScope(user.tenantId);
    }

    if (!user?.refreshTokenHash || !user.isActive) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // Rotate: a stolen copy dies when the real holder refreshes.
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    try {
      // Bumping tokenValidFrom also invalidates issued access tokens.
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null, tokenValidFrom: new Date() },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        // The user row no longer exists; session is effectively dead.
        return;
      }
      throw error;
    }
  }

  async changePassword(
    userId: string,
    dto: ChangePassword,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const isValid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException(
        'Kata sandi saat ini salah. Coba ketik ulang.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    return { message: 'Kata sandi berhasil diperbarui.' };
  }

  /**
   * The caller's profile plus `tenantStatus`. The one route a suspended
   * tenant's user can still reach, so the frontend can explain why.
   */
  async getProfile(userId: string): Promise<SessionResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    const tenant = await this.unscopedPrisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { status: true },
    });
    return {
      ...this.toResponse(user),
      // A missing tenant row must not read as ACTIVE.
      tenantStatus: tenant?.status ?? 'SUSPENDED',
    };
  }

  /** Self-service name change. Email is not self-service. */
  async updateProfile(userId: string, dto: UpdateSelf): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name },
    });
    return this.toResponse(updated);
  }

  /**
   * Self-service soft deactivation (`Sale.userId` is an audit trail). Refuses
   * to deactivate the last active OWNER.
   */
  async deactivateSelf(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    if (user.role === 'OWNER') {
      const activeOwnerCount = await this.prisma.user.count({
        where: { role: 'OWNER', isActive: true },
      });
      if (activeOwnerCount <= 1) {
        throw new LastActiveOwnerException();
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    return { message: 'Account deactivated' };
  }

  private async generateTokens(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
  ): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.getSecret('JWT_SECRET'),
        // Cast: an env-var string cannot satisfy the narrowed `expiresIn` type.
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '1d') as `${number}d`,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.getSecret('JWT_REFRESH_SECRET'),
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ??
          '30d') as `${number}d`,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, BCRYPT_ROUNDS),
      },
    });
  }

  private getSecret(key: string): string {
    const value = process.env[key];
    if (!value) {
      this.logger.error(`Environment variable ${key} is required`);
      throw new ServiceUnavailableException(SERVER_MISCONFIGURED);
    }
    return value;
  }

  private toResponse(user: {
    id: string;
    name: string;
    email: string;
    role: UserResponse['role'];
    branchId: string | null;
    isActive: boolean;
    photoUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      isActive: user.isActive,
      photoUrl: user.photoUrl ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
