import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateBranch, UpdateBranch } from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  MainStoreProtectedException,
  SystemBranchProtectedException,
} from './branches.exceptions';

/** Ported from Kasync, with the `userId` scoping removed (ERD §7 porting note 1). */
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranch) {
    try {
      // The Owner's first store is the main store, with no switch to tick.
      // Count and insert share one transaction so two concurrent creates cannot
      // both read zero; `branches_single_main_store` is the backstop if they do.
      return await this.prisma.$transaction(async (tx) => {
        const mainStoreCount = await tx.branch.count({
          where: { isMainStore: true },
        });
        return tx.branch.create({
          data: {
            name: dto.name,
            address: dto.address ?? null,
            // Never settable from a request: the system row is created only by
            // `ensureSystemRefs`.
            isSystem: false,
            isMainStore: mainStoreCount === 0,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(`Branch "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.branch.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  async update(id: string, dto: UpdateBranch) {
    const branch = await this.findOne(id);
    if (branch.isSystem) {
      throw new SystemBranchProtectedException();
    }
    return this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address ?? null }),
      },
    });
  }

  /**
   * Moves the main-store designation. Release and re-assign must be one
   * transaction: between the two writes `branches_single_main_store` is
   * satisfied by zero rows, and a crash in between would leave no main store.
   */
  async setMainStore(id: string) {
    const branch = await this.findOne(id);
    if (branch.isSystem) {
      throw new SystemBranchProtectedException();
    }
    if (branch.isMainStore) {
      return branch;
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({
        where: { isMainStore: true },
        data: { isMainStore: false },
      });
      return tx.branch.update({ where: { id }, data: { isMainStore: true } });
    });
  }

  async remove(id: string) {
    const branch = await this.findOne(id);
    if (branch.isSystem) {
      throw new SystemBranchProtectedException();
    }

    const assignedUsers = await this.prisma.user.findMany({
      where: { branchId: id },
      select: { name: true, email: true },
    });
    if (assignedUsers.length > 0) {
      const names = assignedUsers.map((u) => u.name || u.email).join(', ');
      throw new BadRequestException(
        `Cannot delete branch referenced by assigned staff (${names})`,
      );
    }

    if (branch.isMainStore) {
      // Checked AFTER the staff guard: the main store is usually the one with
      // staff on it, and "reassign these people first" is the more actionable
      // message of the two. Deleting the last store is legitimate (a fresh
      // install correcting a typo); deleting the main store while others remain
      // is not — it leaves a business with stores and no main store, and
      // nothing in the UI explains the missing badge.
      const otherStores = await this.prisma.branch.count({
        where: { id: { not: id }, isSystem: false },
      });
      if (otherStores > 0) {
        throw new MainStoreProtectedException(branch.name);
      }
    }

    try {
      return await this.prisma.branch.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Cannot delete branch referenced by existing transactions or staff',
        );
      }
      throw error;
    }
  }
}
