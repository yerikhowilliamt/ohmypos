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

@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);

  constructor(
    /**
     * Cross-tenant by definition — this is one of the four places
     * `UnscopedPrismaService` is legitimate (see its doc comment).
     */
    private readonly prisma: UnscopedPrismaService,
    /**
     * The tenant-FILTERED client, used for exactly one thing: provisioning a
     * new tenant's own rows inside `runWithTenant`. Doing that seeding through
     * the unscoped client would let `ensureSystemRefs` find ANOTHER tenant's
     * system branch by `isSystem: true` and skip creating one — leaving the new
     * tenant unable to record its first sale, with no error at creation time.
     */
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
      // VOIDED excluded, matching how every report defines revenue (DEBT-010).
      // A voided sale's row survives for the audit trail, so summing blindly
      // here would make this figure disagree with the tenant's own reports.
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
   * ADR-025 Decision 7 — one transaction creates the tenant, its business
   * profile, its system refs, and its first OWNER. A tenant missing any of
   * these is broken from birth: without the system branch and the two system
   * categories, `system-refs.ts` throws a 503 on the tenant's FIRST sale and
   * FIRST central purchase, and without an OWNER nobody can ever log in to
   * find out, since there is no self-registration.
   */
  async create(dto: CreateTenant): Promise<TenantResponse> {
    // Checked up front so the common case gets a precise message; the unique
    // indexes below are what actually enforce it under a race, and P2002 is
    // mapped back to the same exceptions.
    const [slugTaken, emailTaken] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug: dto.slug } }),
      this.prisma.user.findUnique({ where: { email: dto.owner.email } }),
    ]);
    if (slugTaken) throw new TenantSlugTakenException(dto.slug);
    if (emailTaken) throw new OwnerEmailTakenException(dto.owner.email);

    // The id is generated here rather than by the database because the tenant
    // scope has to be open BEFORE the first scoped write, and the scope needs
    // the id. `@default(uuid())` in the schema would only produce it too late.
    const tenantId = randomUUID();
    const passwordHash = await bcrypt.hash(dto.owner.password, BCRYPT_ROUNDS);

    try {
      return await runWithTenant(tenantId, () =>
        this.scopedPrisma.$transaction(async (tx) => {
          // `Tenant` is in PLATFORM_MODELS, so the extension passes this
          // through unstamped — and it must come first, or every row below
          // fails its `tenant_id` foreign key.
          const tenant = await tx.tenant.create({
            data: { id: tenantId, name: dto.name, slug: dto.slug },
          });

          await tx.businessProfile.create({ data: { name: dto.name } });
          await ensureSystemRefs(tx);

          // ADR-011 §2: an OWNER is not assigned to a branch.
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
      // Suspending a business stops every one of its users mid-session
      // (TenantStatusGuard), so it is worth a line in the log naming who did it.
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

  /**
   * There is deliberately no `remove`. Deleting a tenant would mean deleting
   * every financial record it owns, and every FK in this schema is `Restrict`
   * for exactly that reason. `status: SUSPENDED` is how a tenant is switched
   * off; actually erasing one is an operations task with a backup, not an
   * HTTP DELETE.
   */

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
   * A platform operator setting a tenant OWNER's password (TASK-130).
   *
   * This is a tenant's last recovery floor: if an OWNER forgets their password
   * and there is no second OWNER, nobody inside that business can help them,
   * and there is no self-registration or email reset to fall back on.
   *
   * Unlike impersonation, this WRITES — so it deliberately does not go through
   * an impersonation token, which is read-only by design (ADR-025 Decision 8),
   * but through the platform admin's own session.
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

    // Three conditions, one message. Distinguishing "no such user" from
    // "another tenant's user" from "not an OWNER" would tell the caller things
    // about a row they did not correctly name.
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

    // `warn`, not `log`: this should be rare, and what someone reading the log
    // wants is every occurrence at once. The password is NOT recorded; the
    // reason is — that is what makes it mandatory.
    this.logger.warn(
      `Owner password reset: platformAdmin=${platformAdminId} tenant=${tenant.slug} target=${user.id} reason=${JSON.stringify(dto.reason)}`,
    );

    return {
      message:
        'Kata sandi Owner berhasil direset. Sampaikan lewat jalur terpisah, jangan lewat email biasa.',
    };
  }

  /**
   * TASK-131 — eleven existence counts, run together, folded into one decision
   * by `summarizeTenantData`. `count` rather than `findFirst` because the
   * numbers themselves are what the operator reads in the refusal message
   * ("3 penjualan" tells them more than "ada data").
   *
   * Unscoped and keyed on `tenantId` explicitly: this runs outside
   * `runWithTenant`, so nothing filters these queries for us.
   */
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
   * A platform operator correcting the email a tenant OWNER logs in with
   * (TASK-131).
   *
   * The case this exists for: an operator provisions a tenant, mistypes the
   * owner's address, and the business cannot log in at all. Nothing inside the
   * tenant can fix that — the email IS the login, there is no self-registration,
   * and `resetOwnerPassword` only sets a password on an address the owner does
   * not own.
   *
   * The same call on a tenant that has been trading hands somebody the login of
   * a live business, so the tenant is measured first: pristine goes through,
   * anything else needs `acknowledgeExistingData` and is logged as such. That
   * is a speed bump by decision, not a wall — the operator who needs it is not
   * blocked, but cannot do it without reading what they are doing it to.
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

    // One message for three conditions, exactly as `resetOwnerPassword` does:
    // separating "no such user" from "another tenant's user" would confirm the
    // existence of a row the caller named wrongly.
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

    // `users.email` is globally unique by decision (ADR-025 Decision 6), so the
    // collision can be with a user in any tenant — which is what the exception
    // message says, so the operator does not go looking in this one.
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
          // The old address may have been somebody else's, or a typo that
          // happens to be deliverable. Whatever holds a session on this account
          // now loses it.
          refreshTokenHash: null,
          tokenValidFrom: new Date(),
        },
      });

      // `warn`, not `log`: this rewrites a login identity and should be rare
      // enough that a reader wants every occurrence at once. Both addresses are
      // recorded — the old one is what makes the change reversible.
      this.logger.warn(
        `Owner email changed: platformAdmin=${platformAdminId} tenant=${tenant.slug} target=${user.id} from=${user.email} to=${updated.email} pristine=${summary.isPristine} existingData=${JSON.stringify(summary.evidence)} reason=${JSON.stringify(dto.reason)}`,
      );

      return {
        message: `Email Owner diubah menjadi ${updated.email}. Owner keluar dari semua perangkat dan harus login dengan alamat baru ini.`,
        ownerId: updated.id,
        ownerEmail: updated.email,
      };
    } catch (error) {
      // The `findUnique` above loses to a concurrent write; the unique index is
      // what actually decides.
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
