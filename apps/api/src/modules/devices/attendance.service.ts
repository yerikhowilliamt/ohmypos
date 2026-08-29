import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type {
  AttendanceListResponse,
  AttendanceQuery,
  AttendanceRecordResponse,
  AttendanceStatus,
  AttendanceViolationReason,
  UpdateAttendanceStatus,
} from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { verifyDeviceCookie } from '../../common/utils/device-cookie.util';

/**
 * Writes one AttendanceRecord per KASIR login and returns whether it was
 * valid (Phase 11, Context section — informational only, never blocks
 * login). Not called for ADMIN/OWNER; the caller (AuthService.login) decides
 * that, this service does not re-check the role itself.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(
    id: string,
    dto: UpdateAttendanceStatus,
  ): Promise<AttendanceRecordResponse> {
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        'Data absensi tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    const updated = await this.prisma.attendanceRecord.update({
      where: { id },
      data: {
        isValid: dto.isValid,
        violationReason: dto.isValid
          ? null
          : (dto.violationReason ??
            existing.violationReason ??
            'NO_DEVICE_COOKIE'),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        device: {
          select: {
            id: true,
            label: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      userName: updated.user.name,
      userEmail: updated.user.email,
      branchId: updated.user.branchId,
      branchName: updated.user.branch?.name ?? null,
      deviceId: updated.deviceId,
      deviceLabel: updated.device?.label ?? null,
      loginAt: updated.loginAt,
      isValid: updated.isValid,
      violationReason: updated.violationReason,
      ipAddress: updated.ipAddress,
      userAgent: updated.userAgent,
      createdAt: updated.createdAt,
    };
  }

  async findRecords(query: AttendanceQuery): Promise<AttendanceListResponse> {
    const {
      page = 1,
      limit = 50,
      search,
      branchId,
      violationOnly,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    } = query;
    const skip = (page - 1) * limit;

    // Both the search and the branch filter are OR groups, so they are collected
    // into an AND array rather than written as two `OR` keys on one object —
    // the second key would silently overwrite the first, and searching would
    // quietly drop the branch scoping.
    const andClauses: Prisma.AttendanceRecordWhereInput[] = [];

    if (search) {
      andClauses.push({
        OR: [
          { user: { name: { contains: search, mode: 'insensitive' } } },
          // Email is searchable although no column renders it on its own: the
          // Karyawan cell prints it under the name (DEBT-052).
          { user: { email: { contains: search, mode: 'insensitive' } } },
          {
            user: {
              branch: { name: { contains: search, mode: 'insensitive' } },
            },
          },
          { device: { label: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (branchId) {
      andClauses.push({
        OR: [{ user: { branchId } }, { device: { branchId } }],
      });
    }

    const where: Prisma.AttendanceRecordWhereInput = {
      ...(violationOnly ? { isValid: false } : {}),
      ...(andClauses.length ? { AND: andClauses } : {}),
      // `loginAt`, NOT `createdAt`: both default to now() and are equal in
      // practice, so filtering the wrong one would never fail a test written
      // against real data. loginAt is what the calendar matrix reads.
      ...(startDate || endDate
        ? {
            loginAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const direction = sortOrder ?? 'desc';
    const orderBy: Prisma.AttendanceRecordOrderByWithRelationInput =
      sortBy === 'userName'
        ? { user: { name: direction } }
        : sortBy === 'branchName'
          ? // Sorts by the *user's* branch, matching the column the table
            // renders (`record.user.branch.name`). The device's branch is a
            // different thing and is only used by the branchId filter's OR.
            { user: { branch: { name: direction } } }
          : sortBy === 'deviceLabel'
            ? { device: { label: direction } }
            : { [sortBy ?? 'loginAt']: direction };

    const [records, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              branchId: true,
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          device: {
            select: {
              id: true,
              label: true,
            },
          },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return {
      data: records.map((record) => ({
        id: record.id,
        userId: record.userId,
        userName: record.user.name,
        userEmail: record.user.email,
        branchId: record.user.branchId,
        branchName: record.user.branch?.name ?? null,
        deviceId: record.deviceId,
        deviceLabel: record.device?.label ?? null,
        loginAt: record.loginAt,
        isValid: record.isValid,
        violationReason: record.violationReason,
        ipAddress: record.ipAddress,
        userAgent: record.userAgent,
        createdAt: record.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async checkAndRecord(
    user: { id: string; branchId: string | null },
    deviceCookieValue: string | undefined,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<AttendanceStatus> {
    let deviceId: string | null = null;
    let violationReason: AttendanceViolationReason | null = null;

    if (!deviceCookieValue) {
      violationReason = 'NO_DEVICE_COOKIE';
    } else {
      const candidateId = verifyDeviceCookie(
        deviceCookieValue,
        this.getSecret(),
      );
      if (!candidateId) {
        violationReason = 'DEVICE_NOT_REGISTERED';
      } else {
        const device = await this.prisma.device.findUnique({
          where: { id: candidateId },
        });
        if (!device) {
          violationReason = 'DEVICE_NOT_REGISTERED';
        } else {
          deviceId = device.id;
          if (!device.isActive) {
            violationReason = 'DEVICE_INACTIVE';
          } else if (device.branchId !== user.branchId) {
            violationReason = 'DEVICE_WRONG_BRANCH';
          }
        }
      }
    }

    const isValid = violationReason === null;

    await this.prisma.attendanceRecord.create({
      data: {
        userId: user.id,
        deviceId,
        isValid,
        violationReason,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    return { isValid, violationReason };
  }

  private getSecret(): string {
    const value = process.env.DEVICE_COOKIE_SECRET;
    if (!value) {
      throw new Error('DEVICE_COOKIE_SECRET environment variable is required');
    }
    return value;
  }
}
