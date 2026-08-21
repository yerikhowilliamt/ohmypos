import { SetMetadata } from '@nestjs/common';

export const BRANCH_SCOPE_KEY = 'branchScope';

/** Where on the request the target branch id is found. */
export type BranchScopeSource =
  'body.branchId' | 'query.branchId' | 'params.branchId' | 'params.id';

/**
 * Marks an endpoint as branch-attributable and states exactly where its branch
 * id lives (Playbook §8). Naming the location is deliberate: a guard that
 * scanned the request for any `branchId` could not tell "this endpoint has no
 * branch" from "the branch field was forgotten", and would let the second case
 * through.
 */
export const BranchScoped = (source: BranchScopeSource) =>
  SetMetadata(BRANCH_SCOPE_KEY, source);
