import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  ImpersonationSessionResponse,
  StartImpersonation,
} from '@ohmypos/api-contracts';
import { UnscopedPrismaService } from '../../common/prisma/prisma.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { SERVER_MISCONFIGURED } from '../../common/messages';
import {
  ImpersonationSessionNotFoundException,
  TenantHasNoActiveOwnerException,
  TenantNotFoundException,
} from './platform.exceptions';

/** Not env-configurable on purpose: a longer need means a second audited session. */
const IMPERSONATION_TTL_SECONDS = 30 * 60;

/**
 * Read-only, 30-minute tenant sessions for platform operators (ADR-025 Decision 8).
 * Every session is recorded with a reason.
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  // Unscoped: cross-tenant by definition.
  constructor(
    private readonly prisma: UnscopedPrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async start(
    platformAdminId: string,
    tenantId: string,
    dto: StartImpersonation,
  ): Promise<ImpersonationSessionResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new TenantNotFoundException();
    }

    // The oldest active OWNER: the account created with the tenant.
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'OWNER', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) {
      throw new TenantHasNoActiveOwnerException();
    }

    const session = await this.prisma.impersonationSession.create({
      data: {
        platformAdminId,
        tenantId,
        actingAsUserId: owner.id,
        reason: dto.reason,
      },
    });

    // Logged before minting, so a crash never leaves a token without a record.
    this.logger.warn(
      `Impersonation started: platformAdmin=${platformAdminId} tenant=${tenant.slug} actingAs=${owner.email} session=${session.id}`,
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: owner.id,
      email: owner.email,
      role: owner.role,
      branchId: owner.branchId,
      tenantId: owner.tenantId,
      imp: { sessionId: session.id, platformAdminId },
    };

    // Tenant secret: verified by JwtAuthGuard; `imp` triggers ImpersonationReadOnlyGuard.
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getTenantSecret(),
      expiresIn: IMPERSONATION_TTL_SECONDS,
    });

    return {
      ...this.toResponse(session, owner.email),
      accessToken,
      expiresAt: new Date((nowSeconds + IMPERSONATION_TTL_SECONDS) * 1000),
    };
  }

  /**
   * Ends the caller's own most recent open session. The token stays valid
   * until it expires; there is no revocation list.
   */
  async end(platformAdminId: string): Promise<ImpersonationSessionResponse> {
    const open = await this.prisma.impersonationSession.findFirst({
      where: { platformAdminId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) {
      throw new ImpersonationSessionNotFoundException();
    }

    const session = await this.prisma.impersonationSession.update({
      where: { id: open.id },
      data: { endedAt: new Date() },
    });

    this.logger.warn(
      `Impersonation ended: platformAdmin=${platformAdminId} session=${session.id}`,
    );

    const actingAs = await this.prisma.user.findUnique({
      where: { id: session.actingAsUserId },
      select: { email: true },
    });

    return this.toResponse(session, actingAs?.email ?? '');
  }

  async listForTenant(
    tenantId: string,
  ): Promise<ImpersonationSessionResponse[]> {
    const sessions = await this.prisma.impersonationSession.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: sessions.map((s) => s.actingAsUserId) } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return sessions.map((session) =>
      this.toResponse(session, emailById.get(session.actingAsUserId) ?? ''),
    );
  }

  private getTenantSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(SERVER_MISCONFIGURED);
    }
    return secret;
  }

  private toResponse(
    session: {
      id: string;
      platformAdminId: string;
      tenantId: string;
      actingAsUserId: string;
      reason: string;
      startedAt: Date;
      endedAt: Date | null;
    },
    actingAsEmail: string,
  ): ImpersonationSessionResponse {
    return {
      id: session.id,
      platformAdminId: session.platformAdminId,
      tenantId: session.tenantId,
      actingAsUserId: session.actingAsUserId,
      actingAsEmail,
      reason: session.reason,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }
}
