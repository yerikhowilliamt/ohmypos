import { Injectable } from '@nestjs/common';
import type {
  AttendanceQuery,
  AttendanceRecordResponse,
  AttendanceStatus,
  AttendanceViolationReason,
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

  async findRecords(
    query: AttendanceQuery,
  ): Promise<AttendanceRecordResponse[]> {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        ...(query.violationOnly ? { isValid: false } : {}),
        ...(query.branchId
          ? {
              OR: [
                { user: { branchId: query.branchId } },
                { device: { branchId: query.branchId } },
              ],
            }
          : {}),
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
      orderBy: { loginAt: 'desc' },
      take: query.limit,
    });

    return records.map((record) => ({
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
    }));
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
