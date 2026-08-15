/**
 * `@ohmypos/api-contracts` — every request/response shape is defined here once,
 * as a Zod schema, and imported by both `apps/api` (request validation) and
 * `apps/web` (form validation). TypeScript types are derived via `z.infer`,
 * never hand-written alongside. See ADR-010 and Playbook §4.
 *
 * Naming convention (Playbook §18): one file per resource, `<resource>.schema.ts`,
 * exporting a PascalCase schema and its inferred type.
 */
export * from './primitives';
export * from './enums';
export * from './pagination.schema';
export * from './account.schema';
export * from './category.schema';
export * from './branch.schema';
export * from './ledger-entry.schema';
export * from './bank-transaction.schema';
export * from './allocation.schema';
export * from './matching.schema';
export * from './reconciliation.schema';
export * from './user.schema';
export * from './auth.schema';
