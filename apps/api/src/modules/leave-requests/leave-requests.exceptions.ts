import { BadRequestException } from '@nestjs/common';

/** Domain exceptions for the Leave Requests module (Playbook §6). */
export class LeaveRequestAlreadyReviewedException extends BadRequestException {
  constructor() {
    super('Pengajuan cuti ini sudah disetujui atau ditolak sebelumnya.');
    this.name = 'LeaveRequestAlreadyReviewedException';
  }
}
