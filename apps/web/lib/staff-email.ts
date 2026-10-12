/**
 * Suggests a staff login on the Owner's domain ("Novi" → `novi@lospollos.id`).
 * A suggestion only: the field stays editable and nothing enforces the domain.
 */

/** Combining marks, which NFD splits off the base letters. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** First name folded to ASCII ("José" → "jose"); '' when nothing survives. */
export function toEmailLocalPart(name: string): string {
  const firstWord = name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .trim()
    .split(/\s+/)[0];
  return (firstWord ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The part right of the `@`, or null if there isn't one. */
export function domainOf(email: string): string | null {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return domain ? domain : null;
}

/** `null` when either half is unusable, so the caller leaves the field alone. */
export function suggestStaffEmail(
  name: string,
  ownerEmail: string | undefined | null,
): string | null {
  if (!ownerEmail) return null;
  const domain = domainOf(ownerEmail);
  const local = toEmailLocalPart(name);
  if (!domain || !local) return null;
  return `${local}@${domain}`;
}
