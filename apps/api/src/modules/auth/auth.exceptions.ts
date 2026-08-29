import { BadRequestException } from '@nestjs/common';

/**
 * Domain exceptions for the Auth module (Playbook §6). Raised instead of bare
 * framework exceptions so the rule being broken is named at the throw site.
 */

/**
 * ADR-011 §5 — user creation/management is OWNER-only with no approval
 * workflow. Letting the last active OWNER deactivate themselves would leave
 * the business with no one who can create or manage staff, so it's refused.
 */
export class LastActiveOwnerException extends BadRequestException {
  constructor() {
    super(
      'Anda satu-satunya Owner yang masih aktif, jadi akun ini tidak bisa dinonaktifkan. Angkat Owner lain terlebih dahulu.',
    );
    this.name = 'LastActiveOwnerException';
  }
}
