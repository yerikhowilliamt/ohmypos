import { ConflictException, NotFoundException } from '@nestjs/common';

export class TenantSlugTakenException extends ConflictException {
  constructor(slug: string) {
    super(
      `Slug "${slug}" sudah dipakai tenant lain. Pilih slug yang berbeda — slug harus unik di seluruh platform.`,
    );
    this.name = 'TenantSlugTakenException';
  }
}

/** The email collides with a user in any tenant (ADR-025 Decision 6). */
export class OwnerEmailTakenException extends ConflictException {
  constructor(email: string) {
    super(
      `Email ${email} sudah terdaftar di platform ini — satu email hanya bisa dipakai di satu tenant. Gunakan alamat lain untuk owner tenant baru.`,
    );
    this.name = 'OwnerEmailTakenException';
  }
}

/** Owner email change on a non-pristine tenant without `acknowledgeExistingData`. */
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

/** Impersonation needs an active OWNER to act as. */
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
