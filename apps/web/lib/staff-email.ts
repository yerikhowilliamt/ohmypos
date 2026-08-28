/**
 * OhMyPos — staff login address suggestion.
 *
 * An Owner at `venty@lospollos.id` creating "Novi" gets `novi@lospollos.id`,
 * so every staff login lives on the business's own domain without the Owner
 * retyping it. User creation is OWNER-only (ADR-011), so "the creator's
 * domain" is always unambiguous.
 *
 * This is a SUGGESTION, never a rule. Nothing in `CreateUserSchema` constrains
 * the domain, and it should not: an outside bookkeeper on their own domain is
 * a legitimate account. The field stays editable and the Owner's own edit wins.
 */

/** Combining marks, which NFD splits off the base letters. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * First name, folded to something usable left of the `@`.
 * "Novi Andriani" → "novi", "O'Brien" → "obrien", "José" → "jose".
 *
 * Returns '' when nothing survives — a name written in a script with no ASCII
 * letters folds to nothing, and an empty local part is not a suggestion worth
 * making.
 */
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

/**
 * `null` rather than a guess whenever either half is unusable, so the caller
 * leaves the field alone instead of writing something wrong into it.
 */
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
