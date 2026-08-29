import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type {
  CreateLeaveRequest,
  LeaveRequestListQuery,
  LeaveRequestListResponse,
  LeaveRequestResponse,
} from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveRequestAlreadyReviewedException } from './leave-requests.exceptions';

/**
 * Cuti / leave requests (Phase 12, ADR-021). Creation and self-listing are open
 * to any authenticated role; approve/reject/list-all are OWNER-only, enforced
 * by RoleGuard on the controller.
 */
@Injectable()
export class LeaveRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateLeaveRequest,
  ): Promise<LeaveRequestResponse> {
    const request = await this.prisma.leaveRequest.create({
      data: {
        userId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
      },
    });
    return this.toResponse(request);
  }

  async findMine(userId: string): Promise<LeaveRequestResponse[]> {
    const requests = await this.prisma.leaveRequest.findMany({
      where: { userId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toResponse(r));
  }

  async findAll(
    query: LeaveRequestListQuery,
  ): Promise<LeaveRequestListResponse> {
    const {
      page = 1,
      limit = 50,
      status,
      userId,
      overlapsFrom,
      overlapsTo,
      sortBy,
      sortOrder,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeaveRequestWhereInput = {
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
      // Overlap, not containment: a request is "in" the window when it starts
      // on or before the window ends AND ends on or after the window begins.
      // Leave running 28 Feb -> 3 Mar therefore appears in both months, which a
      // gte/lte on startDate alone would silently drop from March.
      ...(overlapsTo ? { startDate: { lte: new Date(overlapsTo) } } : {}),
      ...(overlapsFrom ? { endDate: { gte: new Date(overlapsFrom) } } : {}),
    };

    const orderBy: Prisma.LeaveRequestOrderByWithRelationInput = {
      [sortBy ?? 'createdAt']: sortOrder ?? 'desc',
    };

    const [requests, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      data: requests.map((r) => this.toResponse(r)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async approve(id: string, reviewerId: string): Promise<LeaveRequestResponse> {
    await this.assertPending(id);
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    return this.toResponse(updated);
  }

  async reject(id: string, reviewerId: string): Promise<LeaveRequestResponse> {
    await this.assertPending(id);
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    return this.toResponse(updated);
  }

  private async assertPending(id: string) {
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        'Pengajuan cuti tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    if (existing.status !== 'PENDING') {
      throw new LeaveRequestAlreadyReviewedException();
    }
  }

  private toResponse(request: {
    id: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    reason: string;
    status: LeaveRequestResponse['status'];
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user?: {
      id: string;
      name: string;
      email: string;
    };
  }): LeaveRequestResponse {
    return {
      id: request.id,
      userId: request.userId,
      user: request.user,
      startDate: request.startDate.toISOString().slice(0, 10),
      endDate: request.endDate.toISOString().slice(0, 10),
      reason: request.reason,
      status: request.status,
      reviewedByUserId: request.reviewedByUserId,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
