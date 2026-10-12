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

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranch) {
    try {
      // The first store becomes the main store; count and insert share one transaction.
      return await this.prisma.$transaction(async (tx) => {
        const mainStoreCount = await tx.branch.count({
          where: { isMainStore: true },
        });
        return tx.branch.create({
          data: {
            name: dto.name,
            address: dto.address ?? null,
            // Never from a request: only ensureSystemRefs creates the system row.
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
        throw new BadRequestException(
          `Cabang "${dto.name}" sudah ada. Pakai nama lain.`,
        );
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
      throw new NotFoundException(
        'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
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

  /** Moves the main-store flag. Release and reassign must be one transaction. */
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
        `Cabang ini masih menjadi penugasan ${names}. Pindahkan dulu karyawan tersebut ke cabang lain.`,
      );
    }

    if (branch.isMainStore) {
      // After the staff check (more actionable). The main store may go only if it is the last store.
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
          'Cabang ini tidak bisa dihapus karena masih terkait dengan transaksi atau karyawan yang tercatat.',
        );
      }
      throw error;
    }
  }
}
