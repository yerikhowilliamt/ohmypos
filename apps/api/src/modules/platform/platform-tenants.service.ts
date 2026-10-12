import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateTenant,
  PaginationQuery,
  ResetTenantOwnerPassword,
  TenantDetailResponse,
  TenantListItem,
  TenantResponse,
  UpdateTenant,
  UpdateTenantOwnerEmail,
  UpdateTenantOwnerEmailResponse,
} from '@ohmypos/api-contracts';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import {
  PrismaService,
  UnscopedPrismaService,
} from '../../common/prisma/prisma.service';
import { runWithTenant } from '../../common/prisma/tenant-context';
import { ensureSystemRefs } from '../../common/system-refs';
import { Prisma, type Tenant } from '../../generated/prisma/client';
import {
  OwnerEmailTakenException,
  TenantHasDataUnacknowledgedException,
  TenantNotFoundException,
  TenantSlugTakenException,
} from './platform.exceptions';
import {
  summarizeTenantData,
  type TenantDataSummary,
} from './tenant-data-check';

const BCRYPT_ROUNDS = 10;

interface TenantWithCounts extends Tenant {
  _count: { users: number; branches: number; sales: number };
}

/** Tenant provisioning, status, and owner recovery for platform operators. */
@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);

  constructor(
    private readonly prisma: UnscopedPrismaService,
    /** Used only to seed a new tenant's rows inside `runWithTenant`; see README. */
    private readonly scopedPrisma: PrismaService,
  ) {}

  async findAll(
    query: PaginationQuery,
  ): Promise<{ data: TenantListItem[]; meta: Record<string, number> }> {
    const { page, limit } = query;
    const [total, tenants] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, branches: true, sales: true } },
        },
      }),
    ]);

    return {
      data: tenants.map((tenant) => this.toListItem(tenant)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string): Promise<TenantDetailResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            branches: true,
            sales: true,
            rawMaterials: true,
            products: true,
          },
        },
      },
    });
    if (!tenant) {
      throw new TenantNotFoundException();
    }

    const [revenue, lastSale, owner, dataSummary] = await Promise.all([
      // VOIDED excluded to match tenant reports (DEBT-010).
      this.prisma.sale.aggregate({
        where: { tenantId: id, status: { not: 'VOIDED' } },
        _sum: { totalAmount: true },
      }),
      this.prisma.sale.findFirst({
        where: { tenantId: id, status: { not: 'VOIDED' } },
        orderBy: { soldAt: 'desc' },
        select: { soldAt: true },
      }),
      this.prisma.user.findFirst({
        where: { tenantId: id, role: 'OWNER', isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true },
      }),
      this.assessTenantData(id),
    ]);

    return {
      ...this.toListItem(tenant),
      ownerId: owner?.id ?? null,
      ownerEmail: owner?.email ?? null,
      isPristine: dataSummary.isPristine,
      rawMaterialCount: tenant._count.rawMaterials,
      productCount: tenant._count.products,
      grossRevenue: (revenue._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(
        2,
      ),
      lastSaleAt: lastSale?.soldAt ?? null,
    };
  }

  /**
   * Creates the tenant, its business profile, system refs and first OWNER in
   * one transaction (ADR-025 Decision 7).
   *
   * @throws TenantSlugTakenException
   * @throws OwnerEmailTakenException
   */
  async create(dto: CreateTenant): Promise<TenantResponse> {
    // Pre-check for a precise message; the unique indexes decide under a race.
    const [slugTaken, emailTaken] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug: dto.slug } }),
      this.prisma.user.findUnique({ where: { email: dto.owner.email } }),
    ]);
    if (slugTaken) throw new TenantSlugTakenException(dto.slug);
    if (emailTaken) throw new OwnerEmailTakenException(dto.owner.email);

    // Generated here: the tenant scope must open before the first scoped write.
    const tenantId = randomUUID();
    const passwordHash = await bcrypt.hash(dto.owner.password, BCRYPT_ROUNDS);

    try {
      return await runWithTenant(tenantId, () =>
        this.scopedPrisma.$transaction(async (tx) => {
          // Must be first: every row below references it.
          const tenant = await tx.tenant.create({
            data: { id: tenantId, name: dto.name, slug: dto.slug },
          });

          await tx.businessProfile.create({ data: { name: dto.name } });
          await ensureSystemRefs(tx);

          await tx.user.create({
            data: {
              name: dto.owner.name,
              email: dto.owner.email,
              passwordHash,
              role: 'OWNER',
              branchId: null,
              isActive: true,
            },
          });

          return this.toResponse(tenant);
        }),
      );
    } catch (error) {
      throw this.mapUniqueViolation(error, dto);
    }
  }

  async update(id: string, dto: UpdateTenant): Promise<TenantResponse> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new TenantNotFoundException();
    }

    if (dto.slug && dto.slug !== existing.slug) {
      const taken = await this.prisma.tenant.findUnique({
        where: { slug: dto.slug },
      });
      if (taken) throw new TenantSlugTakenException(dto.slug);
    }

    if (dto.status && dto.status !== existing.status) {
      this.logger.log(
        `Tenant ${existing.slug} status ${existing.status} -> ${dto.status}`,
      );
    }

    try {
      const tenant = await this.prisma.tenant.update({
        where: { id },
        data: dto,
      });
      return this.toResponse(tenant);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.slug
      ) {
        throw new TenantSlugTakenException(dto.slug);
      }
      throw error;
    }
  }

  private mapUniqueViolation(error: unknown, dto: CreateTenant): unknown {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return error;
    }
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(',') : String(target);
    return fields.includes('email')
      ? new OwnerEmailTakenException(dto.owner.email)
      : new TenantSlugTakenException(dto.slug);
  }

  private toResponse(tenant: Tenant): TenantResponse {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  /**
   * Sets a tenant OWNER's password and revokes their sessions. The reason is
   * logged; the password is not.
   */
  async resetOwnerPassword(
    tenantId: string,
    platformAdminId: string,
    dto: ResetTenantOwnerPassword,
  ): Promise<{ message: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new TenantNotFoundException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    // One message for all three cases, so it reveals nothing about other rows.
    if (!user || user.tenantId !== tenantId || user.role !== 'OWNER') {
      throw new NotFoundException(
        'Owner tidak ditemukan pada tenant ini. Muat ulang halaman dan pilih dari daftar.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        refreshTokenHash: null,
        tokenValidFrom: new Date(),
      },
    });

    this.logger.warn(
      `Owner password reset: platformAdmin=${platformAdminId} tenant=${tenant.slug} target=${user.id} reason=${JSON.stringify(dto.reason)}`,
    );

    return {
      message:
        'Kata sandi Owner berhasil direset. Sampaikan lewat jalur terpisah, jangan lewat email biasa.',
    };
  }

  /** Counts the tenant's rows; runs unscoped, so every query filters `tenantId` itself. */
  private async assessTenantData(tenantId: string): Promise<TenantDataSummary> {
    const where = { tenantId };
    const [
      users,
      nonSystemBranches,
      accounts,
      suppliers,
      rawMaterials,
      products,
      sales,
      supplierPurchases,
      ledgerEntries,
      bankTransactions,
      devices,
    ] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.branch.count({ where: { tenantId, isSystem: false } }),
      this.prisma.account.count({ where }),
      this.prisma.supplier.count({ where }),
      this.prisma.rawMaterial.count({ where }),
      this.prisma.product.count({ where }),
      this.prisma.sale.count({ where }),
      this.prisma.supplierPurchase.count({ where }),
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.bankTransaction.count({ where }),
      this.prisma.device.count({ where }),
    ]);

    return summarizeTenantData({
      users,
      nonSystemBranches,
      accounts,
      suppliers,
      rawMaterials,
      products,
      sales,
      supplierPurchases,
      ledgerEntries,
      bankTransactions,
      devices,
    });
  }

  /**
   * Changes a tenant OWNER's login email and revokes their sessions.
   *
   * A tenant that already holds data requires `acknowledgeExistingData`.
   *
   * @throws OwnerEmailTakenException
   * @throws TenantHasDataUnacknowledgedException
   */
  async updateOwnerEmail(
    tenantId: string,
    platformAdminId: string,
    dto: UpdateTenantOwnerEmail,
  ): Promise<UpdateTenantOwnerEmailResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new TenantNotFoundException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    // One message for all three cases, so it reveals nothing about other rows.
    if (!user || user.tenantId !== tenantId || user.role !== 'OWNER') {
      throw new NotFoundException(
        'Owner tidak ditemukan pada tenant ini. Muat ulang halaman dan pilih dari daftar.',
      );
    }

    if (user.email === dto.newEmail) {
      return {
        message: 'Email Owner sudah sama dengan yang Anda masukkan.',
        ownerId: user.id,
        ownerEmail: user.email,
      };
    }

    // Globally unique across tenants (ADR-025 Decision 6).
    const taken = await this.prisma.user.findUnique({
      where: { email: dto.newEmail },
    });
    if (taken) {
      throw new OwnerEmailTakenException(dto.newEmail);
    }

    const summary = await this.assessTenantData(tenantId);
    if (!summary.isPristine && dto.acknowledgeExistingData !== true) {
      throw new TenantHasDataUnacknowledgedException(summary.evidence);
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: dto.newEmail,
          refreshTokenHash: null,
          tokenValidFrom: new Date(),
        },
      });

      // Both addresses are logged so the change is reversible.
      this.logger.warn(
        `Owner email changed: platformAdmin=${platformAdminId} tenant=${tenant.slug} target=${user.id} from=${user.email} to=${updated.email} pristine=${summary.isPristine} existingData=${JSON.stringify(summary.evidence)} reason=${JSON.stringify(dto.reason)}`,
      );

      return {
        message: `Email Owner diubah menjadi ${updated.email}. Owner keluar dari semua perangkat dan harus login dengan alamat baru ini.`,
        ownerId: updated.id,
        ownerEmail: updated.email,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new OwnerEmailTakenException(dto.newEmail);
      }
      throw error;
    }
  }

  private toListItem(tenant: TenantWithCounts): TenantListItem {
    return {
      ...this.toResponse(tenant),
      userCount: tenant._count.users,
      branchCount: tenant._count.branches,
      saleCount: tenant._count.sales,
    };
  }
}
