'use client';

import { ExpenseCategoriesTable } from '@/components/master-data/ExpenseCategoriesTable';
import { useCategories } from '@/hooks/useExpenses';

export function ExpenseCategoriesClient() {
  const {
    data: categories = [],
    isLoading,
    isError,
    refetch,
  } = useCategories();
  const expenseCategories = categories.filter(
    (category) => category.type === 'OUTFLOW',
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Kategori Pengeluaran
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola pilihan kategori untuk pencatatan pengeluaran umum. Kategori
          sistem dipertahankan agar transaksi otomatis tetap konsisten.
        </p>
      </div>

      {isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger"
        >
          <p>Daftar kategori pengeluaran gagal dimuat.</p>
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => void refetch()}
          >
            Coba lagi
          </button>
        </div>
      ) : (
        <ExpenseCategoriesTable
          categories={expenseCategories}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
