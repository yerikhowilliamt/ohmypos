/**
 * User-facing message text, in Indonesian, for the conditions a real person
 * can actually hit.
 *
 * Two rules govern everything written here and in the exception constructors
 * across `src/modules`:
 *
 * 1. **A user reads it, so it is Indonesian.** `ApiError` in the web app
 *    surfaces `body.message` straight onto the screen (`apps/web/lib/api.ts`),
 *    so every message thrown here is UI copy whether or not it was written as
 *    such. The codebase already did this in places — the Mandiri PDF parser
 *    and `system-refs.ts` were Indonesian long before the rest caught up.
 * 2. **It says what to do next.** "Gagal" alone leaves the reader stuck; the
 *    sentence should end with the action that unsticks them.
 *
 * Operator-facing detail (missing env vars, malformed configuration) does NOT
 * belong in a thrown message: log it, and give the user the generic
 * `SERVER_MISCONFIGURED` line instead. Naming a deployment variable to an
 * anonymous caller is a leak, and it is never something they can act on.
 */

/**
 * Every way a session can end — absent token, expired token, rotated-away
 * refresh token, a user row that no longer exists. The causes differ; what the
 * reader can do about it does not.
 */
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

/**
 * ADR-025 — the tenant itself is suspended, so nothing the signed-in user does
 * will work until the platform operator lifts it. Deliberately distinct from
 * ACCOUNT_DEACTIVATED: the account is fine, the business subscription is not,
 * and pointing the reader at their Owner would send them to the wrong person.
 */
export const TENANT_SUSPENDED =
  'Akses bisnis ini sedang ditangguhkan. Hubungi penyedia layanan OhMyPos.';

/**
 * ADR-025 Fase 3 — a deactivated PLATFORM admin. Distinct from
 * ACCOUNT_DEACTIVATED, which tells the reader to contact their Owner: a
 * platform operator has no Owner, and sending them to a tenant's owner would be
 * both useless and a hint about who else exists.
 */
export const PLATFORM_ACCOUNT_DEACTIVATED =
  'Akun platform ini sudah dinonaktifkan. Hubungi administrator platform lain untuk mengaktifkannya kembali.';

/**
 * ADR-025 Decision 8 — an impersonation token may only read. Lives here rather
 * than in `modules/platform/platform.exceptions.ts` because the guard that
 * throws it is in `common/guards`, and `common` must not depend on a module.
 */
export const IMPERSONATION_IS_READ_ONLY =
  'Sesi ini hanya bisa membaca data. Keluar dari mode impersonasi terlebih dahulu untuk mengubah apa pun.';
