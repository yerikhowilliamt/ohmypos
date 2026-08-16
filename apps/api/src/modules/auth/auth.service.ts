import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  ChangePassword,
  Login,
  UserResponse,
} from '@ohmypos/api-contracts';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 10;

/**
 * Ported from Kasync's Auth pattern (ADR-011 §3): JWT access + refresh tokens,
 * refresh-token rotation, and `tokenValidFrom` for immediate revocation.
 *
 * Kasync's `register` is deliberately absent — user creation is OWNER-only and
 * lives in UsersService (ADR-011 §5, ERD §7 note 2).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: Login): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Compare against a dummy hash when the user does not exist, so a missing
    // account and a wrong password take the same time (carried over from Kasync).
    const hashToCompare =
      user?.passwordHash ??
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTU1234567890';
    const isPasswordValid = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return { user: this.toResponse(user), tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.getSecret('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user?.refreshTokenHash || !user.isActive) {
      throw new UnauthorizedException('Access denied');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Access denied');
    }

    // Rotation: the presented refresh token is replaced, so a stolen copy is
    // useless after the legitimate holder refreshes once.
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
      // Bumping tokenValidFrom kills any access token already issued, not just
      // the refresh token.
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
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        refreshTokenHash: null,
        // A credential change revokes every existing session (ADR-011 §3).
        tokenValidFrom: new Date(),
      },
    });

    return { message: 'Password updated successfully' };
  }

  async getProfile(userId: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.toResponse(user);
  }

  private async generateTokens(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
  ): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.getSecret('JWT_SECRET'),
        // `expiresIn` accepts a duration string, but its type is narrowed to a
        // literal union that an env var cannot satisfy (same cast as Kasync).
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
      throw new UnauthorizedException(
        `Environment variable ${key} is required`,
      );
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
