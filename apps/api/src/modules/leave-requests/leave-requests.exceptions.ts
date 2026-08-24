import { BadRequestException } from '@nestjs/common';

/** Domain exceptions for the Leave Requests module (Playbook §6). */
export class LeaveRequestAlreadyReviewedException extends BadRequestException {
  constructor() {
    super('This leave request has already been approved or rejected');
    this.name = 'LeaveRequestAlreadyReviewedException';
  }
}
