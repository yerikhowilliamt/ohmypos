import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateUser,
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
        throw new NotFoundException(`Branch with ID ${dto.branchId} not found`);
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
      throw new NotFoundException(`User with ID ${id} not found`);
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
        throw new NotFoundException(`Branch with ID ${dto.branchId} not found`);
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

  private assertRoleBranchConsistent(
    role: CreateUser['role'],
    branchId: string | null,
  ) {
    if (role === 'KASIR' && !branchId) {
      throw new InvalidRoleBranchAssignmentException(
        'branchId is required when role is KASIR',
      );
    }
    if (role !== 'KASIR' && branchId) {
      throw new InvalidRoleBranchAssignmentException(
        'branchId must be null when role is ADMIN or OWNER',
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
