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
export * from './device.schema';
export * from './leave-request.schema';
export * from './auth.schema';
export * from './raw-material.schema';
export * from './product.schema';
export * from './recipe.schema';
export * from './supplier.schema';
export * from './supplier-purchase.schema';
export * from './payable.schema';
export * from './stock-movement.schema';
export * from './sale.schema';
export * from './period.schema';
export * from './opening-stock.schema';
export * from './inventory-summary.schema';
export * from './report.schema';
export * from './business-profile.schema';
// v2 platform console (ADR-025). Ordered after the tenant schema they build on.
export * from './tenant.schema';
export * from './platform-admin.schema';
export * from './platform-metrics.schema';
export * from './impersonation.schema';
export * from './platform-password-reset.schema';
export * from './platform-owner-email.schema';
export * from './vocabulary';
