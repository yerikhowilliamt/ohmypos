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

/** Staff administration. Callers are OWNER-only via RoleGuard. */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUser): Promise<UserResponse> {
    // A domain invariant, enforced for every caller, not only HTTP.
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
          // Application clock, so it compares cleanly with JWT `iat`.
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

    // Validate the merged role/branch state, not only the patched fields.
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

  /** Soft deactivation (`Sale.userId` is an audit trail); ends sessions immediately. */
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

  /** An OWNER resets a staff member's password; never their own (TASK-130). */
  async resetPassword(
    id: string,
    actorId: string,
    dto: ResetUserPassword,
  ): Promise<{ message: string }> {
    // Self-reset would let a stolen session bypass the old-password check.
    if (id === actorId) {
      throw new BadRequestException(
        'Untuk mengubah kata sandi Anda sendiri, gunakan halaman Profil — di sana kata sandi lama wajib diisi.',
      );
    }

    // Through findOne: same 404 and tenant scoping as other endpoints.
    await this.findOne(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        // Revoke every existing session.
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    // Never log the password (Playbook §9).
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
