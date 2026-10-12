import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateAccount,
  PaymentMethodResponse,
  UpdateAccount,
} from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

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

  /** POS payment methods. `select` keeps `openingBalance` (Kas Awal) off the wire. */
  async findPaymentMethods(): Promise<PaymentMethodResponse[]> {
    return this.prisma.account.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException(
        'Akun pembayaran tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
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
