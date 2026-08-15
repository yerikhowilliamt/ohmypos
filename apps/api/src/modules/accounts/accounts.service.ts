import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAccount, UpdateAccount } from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/**
 * Ported from Kasync. The `userId` scoping parameter present on every Kasync
 * method is gone — OhMyPos is single-business (ADR-011, ERD §7 porting note 1).
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccount) {
    return this.prisma.account.create({
      data: {
        name: dto.name,
        type: dto.type,
        openingBalance: new Prisma.Decimal(dto.openingBalance),
      },
    });
  }

  async findAll() {
    return this.prisma.account.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }
    return account;
  }

  async update(id: string, dto: UpdateAccount) {
    await this.findOne(id);
    return this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.openingBalance !== undefined && {
          openingBalance: new Prisma.Decimal(dto.openingBalance),
        }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.account.delete({ where: { id } });
  }
}
