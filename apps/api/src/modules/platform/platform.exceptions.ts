import { ConflictException, NotFoundException } from '@nestjs/common';

/**
 * ADR-025 Fase 4. These messages are read by a platform operator, not by a shop
 * owner, but the two rules from `common/messages.ts` still apply: Indonesian,
 * and end with the action that unsticks the reader.
 */

export class TenantSlugTakenException extends ConflictException {
  constructor(slug: string) {
    super(
      `Slug "${slug}" sudah dipakai tenant lain. Pilih slug yang berbeda — slug harus unik di seluruh platform.`,
    );
    this.name = 'TenantSlugTakenException';
  }
}

/**
 * `users.email` is globally unique by decision, not by omission (ADR-025
 * Decision 6), so this collision can be against a user in ANY tenant. The
 * message says so, because "email sudah terdaftar" would otherwise send the
 * operator looking through the wrong tenant.
 */
export class OwnerEmailTakenException extends ConflictException {
  constructor(email: string) {
    super(
      `Email ${email} sudah terdaftar di platform ini — satu email hanya bisa dipakai di satu tenant. Gunakan alamat lain untuk owner tenant baru.`,
    );
    this.name = 'OwnerEmailTakenException';
  }
}

/**
 * TASK-131 — changing a tenant OWNER's login email on a tenant that has already
 * been used. Not forbidden: an operator may genuinely have to do it. But it is
 * a different act there than on a tenant provisioned five minutes ago, so the
 * refusal names what was found and tells the caller how to proceed anyway.
 */
export class TenantHasDataUnacknowledgedException extends ConflictException {
  constructor(evidence: string[]) {
    super(
      `Tenant ini sudah dipakai (${evidence.join(', ')}), jadi mengubah email Owner berarti memindahkan akses login bisnis yang sedang berjalan. Centang konfirmasi "tenant ini sudah punya data" untuk melanjutkan.`,
    );
    this.name = 'TenantHasDataUnacknowledgedException';
  }
}

export class TenantNotFoundException extends NotFoundException {
  constructor() {
    super('Tenant tidak ditemukan.');
    this.name = 'TenantNotFoundException';
  }
}

/**
 * Impersonation borrows a specific `User` row, so a tenant whose owner was
 * deactivated has nobody to borrow. Recoverable by the operator, so it says how.
 */
export class TenantHasNoActiveOwnerException extends ConflictException {
  constructor() {
    super(
      'Tenant ini tidak punya Owner aktif, jadi tidak bisa dimasuki sebagai Owner. Aktifkan kembali salah satu Owner-nya terlebih dahulu.',
    );
    this.name = 'TenantHasNoActiveOwnerException';
  }
}

export class ImpersonationSessionNotFoundException extends NotFoundException {
  constructor() {
    super('Sesi impersonasi tidak ditemukan atau sudah berakhir.');
    this.name = 'ImpersonationSessionNotFoundException';
  }
}
