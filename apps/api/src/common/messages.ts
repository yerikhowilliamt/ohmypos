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
