import { BadRequestException, NotFoundException } from '@nestjs/common';

/** Domain exceptions for the Devices module (Playbook §6). */

export class InvalidActivationCodeException extends NotFoundException {
  constructor() {
    super('Activation code is invalid or has already been used');
    this.name = 'InvalidActivationCodeException';
  }
}

export class ActivationCodeExpiredException extends BadRequestException {
  constructor() {
    super('Activation code has expired — generate a new one');
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
      `Cannot delete a device with ${count} attendance record(s) — deactivate it instead, ` +
        'so its past logins keep showing the terminal they came from',
    );
    this.name = 'DeviceHasAttendanceHistoryException';
  }
}

export class DeviceBranchLockedException extends BadRequestException {
  constructor() {
    super(
      'Cannot move an active device to another branch — deactivate it first, ' +
        'then re-activate it at the terminal after the change',
    );
    this.name = 'DeviceBranchLockedException';
  }
}
