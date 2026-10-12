import { SetMetadata } from '@nestjs/common';

export const BRANCH_SCOPE_KEY = 'branchScope';

/** Where on the request the target branch id is found. */
export type BranchScopeSource =
  'body.branchId' | 'query.branchId' | 'params.branchId' | 'params.id';

/** Marks an endpoint for `BranchScopeGuard` and names where its branch id lives. */
export const BranchScoped = (source: BranchScopeSource) =>
  SetMetadata(BRANCH_SCOPE_KEY, source);
