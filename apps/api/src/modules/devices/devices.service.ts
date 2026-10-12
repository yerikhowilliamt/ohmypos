import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDevice,
  DeviceResponse,
  UpdateDevice,
} from '@ohmypos/api-contracts';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { signDeviceCookie } from '../../common/utils/device-cookie.util';
import {
  ActivationCodeExpiredException,
  DeviceBranchLockedException,
  DeviceHasAttendanceHistoryException,
  InvalidActivationCodeException,
} from './devices.exceptions';

const ACTIVATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Registry of POS terminals for attendance tracking (ADR-021). OWNER only. */
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDevice): Promise<DeviceResponse> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException(
        'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    const device = await this.prisma.device.create({
      data: {
        branchId: dto.branchId,
        label: dto.label,
        isActive: false,
        activationCode: randomBytes(16).toString('hex'),
        activationCodeExpiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_MS),
      },
    });
    return this.toResponse(device);
  }

  async findAll(): Promise<DeviceResponse[]> {
    const devices = await this.prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((device) => this.toResponse(device));
  }

  /** Activates the terminal whose browser receives the device cookie (OWNER, in person). */
  async activate(
    code: string,
    activatingUserId: string,
  ): Promise<{ device: DeviceResponse; cookieValue: string }> {
    const device = await this.prisma.device.findUnique({
      where: { activationCode: code },
    });
    if (!device || device.isActive) {
      throw new InvalidActivationCodeException();
    }
    if (
      !device.activationCodeExpiresAt ||
      device.activationCodeExpiresAt < new Date()
    ) {
      throw new ActivationCodeExpiredException();
    }

    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        isActive: true,
        activatedByUserId: activatingUserId,
        activatedAt: new Date(),
        activationCode: null,
        activationCodeExpiresAt: null,
      },
    });

    return {
      device: this.toResponse(updated),
      cookieValue: signDeviceCookie(updated.id, this.getSecret()),
    };
  }

  async update(id: string, dto: UpdateDevice): Promise<DeviceResponse> {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        'Perangkat tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    const movingBranch =
      dto.branchId !== undefined && dto.branchId !== existing.branchId;

    // Only a real move is rejected; the edit form resubmits the same branchId.
    if (movingBranch && existing.isActive) {
      throw new DeviceBranchLockedException();
    }
    if (movingBranch) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException(
          'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
        );
      }
    }

    const device = await this.prisma.device.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
      },
    });
    return this.toResponse(device);
  }

  /** Hard delete, refused once the terminal has logins. */
  async remove(id: string): Promise<DeviceResponse> {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        'Perangkat tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    const attendanceCount = await this.prisma.attendanceRecord.count({
      where: { deviceId: id },
    });
    if (attendanceCount > 0) {
      throw new DeviceHasAttendanceHistoryException(attendanceCount);
    }

    await this.prisma.device.delete({ where: { id } });
    return this.toResponse(existing);
  }

  /** Revokes a lost/compromised terminal — future logins from it fail the check. */
  async deactivate(id: string): Promise<DeviceResponse> {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        'Perangkat tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    const device = await this.prisma.device.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toResponse(device);
  }

  private getSecret(): string {
    const value = process.env.DEVICE_COOKIE_SECRET;
    if (!value) {
      throw new Error('DEVICE_COOKIE_SECRET environment variable is required');
    }
    return value;
  }

  private toResponse(device: {
    id: string;
    branchId: string;
    label: string;
    isActive: boolean;
    activatedByUserId: string | null;
    activatedAt: Date | null;
    activationCode: string | null;
    activationCodeExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): DeviceResponse {
    return {
      id: device.id,
      branchId: device.branchId,
      label: device.label,
      isActive: device.isActive,
      activatedByUserId: device.activatedByUserId,
      activatedAt: device.activatedAt,
      activationCode: device.activationCode,
      activationCodeExpiresAt: device.activationCodeExpiresAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}
