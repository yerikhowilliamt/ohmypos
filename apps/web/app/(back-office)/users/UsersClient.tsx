'use client';

import { useBranches } from '@/hooks/useBranches';
import { useUsers } from '@/hooks/useUsers';
import { UsersTable } from '@/components/users/UsersTable';

export function UsersClient() {
  const { data: users = [], isLoading: isUsersLoading } = useUsers();
  const { data: branches = [], isLoading: isBranchesLoading } = useBranches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Pengguna
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola akun staf, peran akses, dan penugasan cabang — hanya OWNER
          (ADR-011).
        </p>
      </div>

      <UsersTable
        users={users}
        branches={branches}
        isLoading={isUsersLoading || isBranchesLoading}
      />
    </div>
  );
}
