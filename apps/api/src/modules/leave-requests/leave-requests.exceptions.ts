import { BadRequestException } from '@nestjs/common';

export class LeaveRequestAlreadyReviewedException extends BadRequestException {
  constructor() {
    super('Pengajuan cuti ini sudah disetujui atau ditolak sebelumnya.');
    this.name = 'LeaveRequestAlreadyReviewedException';
  }
}
