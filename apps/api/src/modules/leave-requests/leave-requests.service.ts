import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateLeaveRequest,
  LeaveRequestListQuery,
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
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toResponse(r));
  }

  async findAll(query: LeaveRequestListQuery): Promise<LeaveRequestResponse[]> {
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        status: query.status,
        userId: query.userId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toResponse(r));
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
    });
    return this.toResponse(updated);
  }

  private async assertPending(id: string) {
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Leave request with ID ${id} not found`);
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
  }): LeaveRequestResponse {
    return {
      id: request.id,
      userId: request.userId,
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
