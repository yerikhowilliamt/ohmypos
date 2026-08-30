import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateUser,
  ResetUserPassword,
  UpdateUser,
  UserResponse,
} from '@ohmypos/api-contracts';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  EmailAlreadyRegisteredException,
  InvalidRoleBranchAssignmentException,
} from './users.exceptions';

const BCRYPT_ROUNDS = 10;

/**
 * User administration. Every endpoint that reaches this service is OWNER-only
 * (ADR-011 §5) — enforced by RoleGuard on the controller, never assumed here.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUser): Promise<UserResponse> {
    // The Zod schema already enforces this, but the rule is a domain invariant
    // and must hold for any caller of the service, not only HTTP requests.
    this.assertRoleBranchConsistent(dto.role, dto.branchId ?? null);

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException(
          'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
        );
      }
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
          role: dto.role,
          branchId: dto.branchId ?? null,
          // Set from the application clock, not the column default: the JWT
          // guard compares this against a token's `iat`, which Node issues, and
          // mixing the two clocks is what forced Kasync's skew tolerance.
          tokenValidFrom: new Date(),
        },
      });
      return this.toResponse(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailAlreadyRegisteredException(dto.email);
      }
      throw error;
    }
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({ orderBy: { name: 'asc' } });
    return users.map((user) => this.toResponse(user));
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(
        'Pengguna tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUser): Promise<UserResponse> {
    const existing = await this.findOne(id);

    // A patch may touch only role or only branchId (e.g. reassigning a KASIR
    // to a different branch without changing their role) — validate the
    // *merged* state, not just the fields sent, or a caller could leave a
    // stray branchId on a user just promoted to ADMIN, or null out a KASIR's
    // required branchId while leaving their role untouched.
    const mergedRole = dto.role ?? existing.role;
    const mergedBranchId =
      dto.branchId !== undefined ? dto.branchId : existing.branchId;
    this.assertRoleBranchConsistent(mergedRole, mergedBranchId ?? null);

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException(
          'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
        );
      }
    }

    try {
      const user = await this.prisma.user.update({ where: { id }, data: dto });
      return this.toResponse(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailAlreadyRegisteredException(dto.email ?? '');
      }
      throw error;
    }
  }

  /**
   * Deactivation is a soft state change, never a delete: `Sale.userId` is an
   * audit trail that must survive a staff member leaving (ADR-011, ERD §2).
   * Bumping `tokenValidFrom` ends their active session immediately.
   */
  async deactivate(id: string): Promise<UserResponse> {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });
    return this.toResponse(user);
  }

  async reactivate(id: string): Promise<UserResponse> {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
    return this.toResponse(user);
  }

  /**
   * An OWNER setting a staff member's password for them (TASK-130).
   *
   * `actorId` is passed in from the controller rather than re-read here, so
   * the identity the guard below checks is the one the auth guard actually
   * authenticated.
   */
  async resetPassword(
    id: string,
    actorId: string,
    dto: ResetUserPassword,
  ): Promise<{ message: string }> {
    // The most important guard in this method. `PATCH /auth/password` demands
    // the OLD password precisely so that a stolen session is not enough to take
    // an account over — the thief holds the cookie but not the password. If an
    // OWNER could reset themselves here without it, that protection would be
    // gone entirely: whoever stole the session would call this on their own id
    // and lock the real owner out.
    if (id === actorId) {
      throw new BadRequestException(
        'Untuk mengubah kata sandi Anda sendiri, gunakan halaman Profil — di sana kata sandi lama wajib diisi.',
      );
    }

    // Through findOne so the 404 matches every other endpoint on this service,
    // and so tenant scoping applies to the read as well as the write.
    await this.findOne(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        // The password changed, so every old session has to die — the same
        // pair `deactivate` writes. Without these two lines a staff member
        // whose password was just reset keeps working on their old session.
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    // Ids only. The password itself is NOT logged, in any form (Playbook §9).
    this.logger.log(`Staff password reset: owner=${actorId} target=${id}`);

    return {
      message:
        'Kata sandi berhasil direset. Sampaikan kata sandi baru ke karyawan lewat jalur terpisah.',
    };
  }

  private assertRoleBranchConsistent(
    role: CreateUser['role'],
    branchId: string | null,
  ) {
    if (role === 'KASIR' && !branchId) {
      throw new InvalidRoleBranchAssignmentException(
        'Cabang wajib dipilih untuk peran Kasir.',
      );
    }
    if (role !== 'KASIR' && branchId) {
      throw new InvalidRoleBranchAssignmentException(
        'Admin dan Owner tidak ditugaskan ke satu cabang, jadi cabangnya harus dikosongkan.',
      );
    }
  }

  /** Never returns passwordHash or refreshTokenHash (Playbook §9). */
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
