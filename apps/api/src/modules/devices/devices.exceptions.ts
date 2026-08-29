import { BadRequestException, NotFoundException } from '@nestjs/common';

/** Domain exceptions for the Devices module (Playbook §6). */

export class InvalidActivationCodeException extends NotFoundException {
  constructor() {
    super(
      'Tautan aktivasi tidak berlaku atau sudah pernah dipakai. Minta Owner menyalin tautan yang baru.',
    );
    this.name = 'InvalidActivationCodeException';
  }
}

export class ActivationCodeExpiredException extends BadRequestException {
  constructor() {
    super(
      'Tautan aktivasi sudah kedaluwarsa. Minta Owner menyalin tautan yang baru.',
    );
    this.name = 'ActivationCodeExpiredException';
  }
}

/**
 * `AttendanceRecord.device` is `onDelete: SetNull`, so deleting a used device
 * would NOT fail and would NOT cascade — it would blank `deviceId` on every
 * past login, and the attendance log renders a blank as "Perangkat Luar", the
 * same wording it uses for a login from an UNREGISTERED device. Months of
 * legitimate in-store attendance would silently start reading as violations.
 * Deactivation already exists for retiring a terminal.
 */
export class DeviceHasAttendanceHistoryException extends BadRequestException {
  constructor(count: number) {
    super(
      `Perangkat ini sudah punya ${count} catatan absensi, jadi tidak bisa dihapus. ` +
        'Nonaktifkan saja, supaya riwayat absensi lama tetap menunjukkan perangkat asalnya.',
    );
    this.name = 'DeviceHasAttendanceHistoryException';
  }
}

export class DeviceBranchLockedException extends BadRequestException {
  constructor() {
    super(
      'Perangkat yang masih aktif tidak bisa dipindah ke cabang lain. ' +
        'Nonaktifkan dulu, ubah cabangnya, lalu aktifkan kembali dari perangkat itu.',
    );
    this.name = 'DeviceBranchLockedException';
  }
}
