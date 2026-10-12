import { BadRequestException, NotFoundException } from '@nestjs/common';

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
 * A device with logins cannot be deleted: `SetNull` would relabel past logins as
 * "Perangkat Luar". Deactivate it instead.
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
