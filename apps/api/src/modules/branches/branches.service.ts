import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateBranch, UpdateBranch } from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/** Ported from Kasync, with the `userId` scoping removed (ERD §7 porting note 1). */
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranch) {
    try {
      return await this.prisma.branch.create({
        data: { name: dto.name, address: dto.address ?? null },
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
    await this.findOne(id);
    return this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address ?? null }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

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
