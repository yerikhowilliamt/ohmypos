import type { UserRole } from '@ohmypos/api-contracts';

export interface HelpSection {
  id: string;
  title: string;
  roles: UserRole[];
  steps: string[];
}

/**
 * Content lives here as a typed array, not MDX (Phase 13 plan §"Context") —
 * developer-authored, lint/typecheck-checked, no new dependency.
 */
export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'login',
    title: 'Cara Login',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    steps: [
      'Buka halaman login OhMyPos di browser.',
      'Masukkan email dan kata sandi yang diberikan oleh Owner.',
      'Klik "Masuk". Jika email atau kata sandi salah, akan muncul pesan error — coba lagi atau hubungi Owner untuk reset.',
      'Setelah berhasil login, Anda akan diarahkan otomatis ke halaman sesuai peran Anda (Kasir ke Penjualan, Admin ke Data Master, Owner ke Dashboard).',
    ],
  },
  {
    id: 'profile',
    title: 'Ubah Nama, Kata Sandi, atau Hapus Akun Sendiri',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    steps: [
      'Klik nama Anda di pojok kanan atas layar.',
      'Pilih "Profil Saya" dari menu yang muncul.',
      'Untuk ubah nama: isi kolom "Nama" pada bagian "Ubah Nama", lalu klik "Simpan Nama".',
      'Untuk ubah kata sandi: isi kata sandi saat ini dan kata sandi baru pada bagian "Ubah Kata Sandi", lalu klik "Ubah Kata Sandi". Anda akan tetap login di perangkat ini, tapi keluar dari perangkat lain.',
      'Untuk menghapus akun sendiri: gulir ke bagian "Hapus Akun" paling bawah, klik "Hapus Akun Saya", lalu konfirmasi. Anda akan langsung keluar dan tidak bisa login lagi — riwayat transaksi Anda tetap tersimpan.',
    ],
  },
  {
    id: 'pos-sale',
    title: 'Melakukan Penjualan (Kasir)',
    roles: ['KASIR'],
    steps: [
      'Buka menu "Penjualan" di sidebar kiri.',
      'Pilih produk yang dibeli pelanggan dengan mengklik kartu produknya — produk akan masuk ke keranjang di sisi kanan.',
      'Sesuaikan jumlah tiap item di keranjang jika perlu.',
      'Klik "Bayar", pilih metode pembayaran, lalu masukkan jumlah yang diterima.',
      'Klik "Selesaikan Transaksi" untuk mencatat penjualan.',
    ],
  },
  {
    id: 'master-data',
    title: 'Mengelola Data Master (Admin & Owner)',
    roles: ['ADMIN', 'OWNER'],
    steps: [
      'Buka menu "Data Master" di sidebar kiri.',
      'Pilih tab sesuai data yang ingin dikelola: Produk, Resep, Bahan Baku, Supplier, Akun, atau Kategori.',
      'Klik "Tambah" untuk membuat data baru, atau klik ikon edit pada baris data untuk mengubahnya.',
      'Untuk menghapus, gunakan ikon hapus pada baris data — beberapa data tidak bisa dihapus jika masih dipakai transaksi lain, ini untuk menjaga riwayat tetap akurat.',
    ],
  },
  {
    id: 'reconciliation',
    title: 'Rekonsiliasi Bank (Admin & Owner)',
    roles: ['ADMIN', 'OWNER'],
    steps: [
      'Buka menu "Rekonsiliasi" di sidebar kiri.',
      'Impor mutasi rekening bank melalui tombol impor CSV, atau pilih akun bank yang sudah punya data.',
      'Cocokkan setiap transaksi bank dengan transaksi pembukuan yang sesuai — sistem akan menyarankan pasangan yang cocok secara otomatis.',
      'Klik "Cocokkan" untuk mengonfirmasi pasangan yang benar, atau lewati jika belum ada pasangannya.',
    ],
  },
  {
    id: 'expenses',
    title: 'Mencatat Pengeluaran (Owner)',
    roles: ['OWNER'],
    steps: [
      'Buka menu "Pengeluaran" di sidebar kiri.',
      'Klik "Tambah Pengeluaran", isi jumlah, kategori, dan akun sumber dana.',
      'Klik "Simpan" untuk mencatat.',
    ],
  },
  {
    id: 'inventory',
    title: 'Memantau Inventaris (Owner)',
    roles: ['OWNER'],
    steps: [
      'Buka menu "Inventaris" di sidebar kiri untuk melihat ringkasan stok bahan baku.',
      'Perhatikan status setiap bahan: OK, LOW (menipis), atau OUT (habis).',
      'Gunakan halaman ini untuk memutuskan kapan harus membuat pembelian baru ke supplier.',
    ],
  },
  {
    id: 'reports',
    title: 'Melihat Laporan (Owner)',
    roles: ['OWNER'],
    steps: [
      'Buka menu "Laporan" di sidebar kiri.',
      'Pilih jenis laporan (Laba Rugi, Pendapatan Harian, dll.) dan rentang tanggal yang diinginkan.',
      'Gunakan filter cepat (hari ini, minggu ini, bulan ini) untuk melihat data tanpa mengatur tanggal manual.',
    ],
  },
  {
    id: 'users-branches',
    title: 'Mengelola Karyawan dan Cabang (Owner)',
    roles: ['OWNER'],
    steps: [
      'Buka menu "Pengguna" untuk menambah, mengubah peran, memindahkan cabang, atau menonaktifkan akun karyawan.',
      'Klik "Tambah Pengguna", isi nama, email, kata sandi awal, peran (Kasir/Admin/Owner), dan cabang (wajib untuk Kasir).',
      'Untuk memindahkan Kasir ke cabang lain, klik edit pada barisnya dan ubah cabang yang dipilih.',
      'Buka menu "Cabang" untuk menambah, mengubah, atau menghapus cabang.',
    ],
  },
];

export function getHelpSections(role: UserRole): HelpSection[] {
  return HELP_SECTIONS.filter((section) => section.roles.includes(role));
}
