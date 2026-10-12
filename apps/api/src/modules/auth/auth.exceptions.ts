import { BadRequestException } from '@nestjs/common';

/** The last active OWNER cannot deactivate themselves (ADR-011). */
export class LastActiveOwnerException extends BadRequestException {
  constructor() {
    super(
      'Anda satu-satunya Owner yang masih aktif, jadi akun ini tidak bisa dinonaktifkan. Angkat Owner lain terlebih dahulu.',
    );
    this.name = 'LastActiveOwnerException';
  }
}
