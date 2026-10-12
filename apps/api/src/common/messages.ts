/** Every way a session can end; the causes differ, the remedy does not. */
export const SESSION_EXPIRED =
  'Sesi Anda sudah berakhir. Silakan masuk kembali.';

export const ACCOUNT_DEACTIVATED =
  'Akun ini sudah dinonaktifkan. Hubungi Owner untuk mengaktifkannya kembali.';

/** Shown for a missing env var or any other deployment-side gap. */
export const SERVER_MISCONFIGURED =
  'Konfigurasi server belum lengkap. Hubungi administrator.';

/** A cashier reaching for another branch's data, or for no branch at all. */
export const OTHER_BRANCH_FORBIDDEN =
  'Anda hanya dapat mengakses data cabang Anda sendiri.';

/** The tenant is suspended; distinct from a deactivated account. */
export const TENANT_SUSPENDED =
  'Akses bisnis ini sedang ditangguhkan. Hubungi penyedia layanan OhMyPos.';

/** A deactivated platform admin, who has no Owner to contact. */
export const PLATFORM_ACCOUNT_DEACTIVATED =
  'Akun platform ini sudah dinonaktifkan. Hubungi administrator platform lain untuk mengaktifkannya kembali.';

/** Impersonation is read-only (ADR-025 Decision 8). */
export const IMPERSONATION_IS_READ_ONLY =
  'Sesi ini hanya bisa membaca data. Keluar dari mode impersonasi terlebih dahulu untuk mengubah apa pun.';
