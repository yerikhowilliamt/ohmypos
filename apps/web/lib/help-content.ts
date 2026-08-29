import type { UserRole } from '@ohmypos/api-contracts';
import {
  ACCOUNT_TYPE_LABELS,
  PAYABLE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  STOCK_STATUS_LABELS,
} from '@/lib/vocabulary';

/**
 * A block of help content. The old shape was `steps: string[]`, which could
 * only express a numbered click-path — so the page had nowhere to put the
 * things that actually confuse people (what a term means, why the app behaves
 * a certain way, what cannot be undone). Every question the Owner has raised
 * about this product was a model question, not a where-do-I-click question.
 */
export type HelpBlock =
  /** A paragraph. Prose, not instructions. */
  | { kind: 'text'; body: string }
  /** An ordered click-path. */
  | { kind: 'steps'; items: string[] }
  /** A callout. `warning` is for anything irreversible or easily misread. */
  | { kind: 'note'; tone: 'info' | 'warning'; body: string }
  /** Term → meaning, for the vocabulary a screen assumes you already know. */
  | { kind: 'terms'; items: { term: string; definition: string }[] }
  /** A left-to-right chain, rendered as boxes and arrows — never an image. */
  | { kind: 'flow'; nodes: string[]; caption?: string };

export type HelpCategory =
  | 'konsep'
  | 'akun'
  | 'penjualan'
  | 'data'
  | 'pengeluaran'
  | 'inventaris'
  | 'laporan'
  | 'bisnis';

export const HELP_CATEGORY_LABELS: Readonly<Record<HelpCategory, string>> = {
  konsep: 'Konsep Dasar',
  akun: 'Akun & Masuk',
  penjualan: 'Penjualan',
  data: 'Data Master',
  pengeluaran: 'Pengeluaran',
  inventaris: 'Inventaris',
  laporan: 'Laporan',
  bisnis: 'Bisnis & Karyawan',
};

/** Reading order of the categories on the page. Konsep first, deliberately. */
export const HELP_CATEGORY_ORDER: HelpCategory[] = [
  'konsep',
  'akun',
  'penjualan',
  'data',
  'pengeluaran',
  'inventaris',
  'laporan',
  'bisnis',
];

export interface HelpSection {
  id: string;
  title: string;
  /** One line under the title, visible before the section is expanded. */
  summary: string;
  category: HelpCategory;
  roles: UserRole[];
  /**
   * Sidebar routes this section documents. `help-content.coverage.test.ts`
   * asserts every route in `nav-config.ts` is claimed by some section the same
   * role can see — so a new page cannot ship without its help topic.
   */
  covers: string[];
  /** Extra search terms a user might type that the prose does not contain. */
  keywords?: string[];
  blocks: HelpBlock[];
}

/**
 * Content lives here as a typed array, not MDX (Phase 13 plan §"Context") —
 * developer-authored, lint/typecheck-checked, no new dependency.
 *
 * Status words are interpolated from the shared vocabulary maps rather than
 * retyped, so renaming a status in `packages/api-contracts` renames it here
 * too. Screen names and button labels are quoted verbatim from the components;
 * when you rename one, grep this file.
 */
export const HELP_SECTIONS: HelpSection[] = [
  // ─────────────────────────── Konsep Dasar ───────────────────────────
  {
    id: 'konsep-alur',
    title: 'Alur besar: dari bahan baku sampai laba',
    summary: 'Bagaimana satu penjualan menggerakkan stok, kas, dan laporan.',
    category: 'konsep',
    roles: ['ADMIN', 'OWNER'],
    covers: [],
    keywords: ['alur', 'cara kerja', 'gambaran umum'],
    blocks: [
      {
        kind: 'text',
        body: 'OhMyPos menghubungkan empat hal yang biasanya dicatat terpisah: stok bahan, harga jual, uang masuk, dan laba. Satu transaksi penjualan menggerakkan keempatnya sekaligus, otomatis. Memahami rantai ini membuat hampir semua angka di aplikasi masuk akal.',
      },
      {
        kind: 'flow',
        nodes: [
          'Bahan Baku',
          'Resep',
          'Produk',
          'Penjualan',
          'Stok turun + Kas naik',
          'Laporan',
        ],
        caption:
          'Setiap panah berjalan otomatis. Anda hanya mengisi ujung kirinya.',
      },
      {
        kind: 'steps',
        items: [
          'Anda mendaftarkan bahan baku beserta harga belinya (misalnya kopi, susu, gula).',
          'Anda membuat resep untuk tiap produk — berapa takaran tiap bahan untuk satu porsi.',
          'Kasir menjual produk itu di layar Penjualan.',
          'Saat itu juga aplikasi mengurangi stok bahan sesuai resep, mencatat uang masuk ke akun pembayaran yang dipilih, dan mengunci modal produk tersebut.',
          'Semua laporan dihitung dari catatan itu — Anda tidak perlu memasukkan ulang apa pun.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Karena stok berkurang otomatis dari resep, produk tanpa resep tetap bisa dijual tetapi tidak akan mengurangi stok bahan apa pun dan modalnya dihitung nol. Isi resepnya kalau Anda ingin laba per produk yang akurat.',
      },
    ],
  },
  {
    id: 'konsep-resep-hpp',
    title: 'Resep dan HPP: dari mana angka laba berasal',
    summary:
      'HPP dihitung dari resep, bukan diketik manual. Ini penjelasannya.',
    category: 'konsep',
    roles: ['ADMIN', 'OWNER'],
    covers: [],
    keywords: ['hpp', 'modal', 'harga pokok', 'margin', 'laba kotor'],
    blocks: [
      {
        kind: 'terms',
        items: [
          {
            term: 'HPP',
            definition:
              'Harga Pokok Penjualan — modal bahan untuk membuat satu produk. Tidak pernah Anda ketik; aplikasi menghitungnya dari resep.',
          },
          {
            term: 'Resep',
            definition:
              'Daftar bahan baku dan takarannya untuk satu porsi produk. Diisi di menu Data Master → Produk & Resep.',
          },
          {
            term: 'Laba kotor',
            definition: 'Harga jual dikurangi HPP, per produk yang terjual.',
          },
        ],
      },
      {
        kind: 'text',
        body: 'Contoh: satu Kopi Susu memakai 18 gram kopi (Rp 200/gram) dan 120 ml susu (Rp 15/ml). HPP-nya Rp 3.600 + Rp 1.800 = Rp 5.400. Kalau dijual Rp 18.000, laba kotornya Rp 12.600. Angka inilah yang muncul di laporan Laba per Produk.',
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Ubah takaran resep atau harga bahan, dan HPP produk berubah untuk penjualan BERIKUTNYA saja. Penjualan yang sudah terjadi tetap memakai HPP saat itu — lihat topik "Kenapa laporan bulan lalu tidak ikut berubah".',
      },
    ],
  },
  {
    id: 'konsep-umum-vs-semua-cabang',
    title: 'Beda "Umum" dan "Semua Cabang"',
    summary:
      'Dua istilah yang terdengar sama, artinya justru bertingkat. Wajib dibaca sebelum memfilter laporan.',
    category: 'konsep',
    roles: ['OWNER'],
    covers: [],
    keywords: ['umum', 'semua cabang', 'pusat', 'sentral', 'filter'],
    blocks: [
      {
        kind: 'text',
        body: 'Dalam bahasa sehari-hari "umum" dan "semua cabang" berarti hal yang sama, jadi wajar kalau membingungkan. Di aplikasi ini keduanya bertingkat: yang satu adalah salah satu isi, yang lain adalah wadahnya.',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'Umum',
            definition:
              'Satu lokasi khusus untuk transaksi yang tidak bisa dibebankan ke satu toko mana pun — misalnya belanja bahan terpusat yang nanti dipakai bersama semua cabang. Ia sejajar dengan Cabang A atau Cabang B, bukan di atasnya.',
          },
          {
            term: 'Semua Cabang',
            definition:
              'Bukan lokasi, melainkan pilihan "jangan disaring". Hasilnya mencakup seluruh cabang DITAMBAH Umum.',
          },
        ],
      },
      {
        kind: 'flow',
        nodes: ['Semua Cabang', 'Cabang Melati + Cabang Kenanga + Umum'],
        caption: 'Semua Cabang adalah wadahnya; Umum salah satu isinya.',
      },
      {
        kind: 'text',
        body: 'Jadi kalau Anda ingin melihat semata-mata biaya yang tidak menempel ke toko mana pun, pilih Umum. Kalau ingin total bisnis apa adanya, pilih Semua Cabang.',
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Umum tidak muncul di layar Penjualan dan tidak bisa dipilih sebagai cabang seorang kasir — memang bukan toko fisik, jadi tidak ada yang bisa berjualan di sana.',
      },
    ],
  },
  {
    id: 'konsep-stok-kas-terpusat',
    title: 'Stok dan kas adalah satu kolam bersama',
    summary:
      'Tidak ada saldo per cabang. Ini disengaja, dan memengaruhi cara membaca angka.',
    category: 'konsep',
    roles: ['ADMIN', 'OWNER'],
    covers: [],
    keywords: ['stok cabang', 'saldo cabang', 'kas cabang', 'terpusat'],
    blocks: [
      {
        kind: 'text',
        body: 'Stok bahan baku dan saldo kas disimpan sebagai satu kolam untuk seluruh bisnis, bukan dipecah per cabang. Kalau kopi tersisa 2 kg, itu 2 kg untuk semua toko bersama-sama — bukan 2 kg di Melati ditambah sekian di Kenanga.',
      },
      {
        kind: 'text',
        body: 'Yang tetap tercatat per cabang adalah kejadiannya: penjualan ini terjadi di cabang mana, pengeluaran ini dibebankan ke cabang mana. Jadi laporan laba per cabang tetap bisa dibaca, sementara stoknya satu.',
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Karena itu di halaman Stok Bahan Baku tidak ada filter cabang. Kalau Anda mencarinya dan tidak menemukannya, bukan fiturnya hilang — memang tidak ada angkanya untuk ditampilkan.',
      },
    ],
  },
  {
    id: 'konsep-utang',
    title: 'Kapan sebuah pembelian menjadi utang',
    summary:
      'Kenapa belanja yang belum dibayar tidak langsung mengurangi kas Anda.',
    category: 'konsep',
    roles: ['OWNER'],
    covers: [],
    keywords: ['utang', 'payable', 'kredit', 'tempo', 'lunas'],
    blocks: [
      {
        kind: 'text',
        body: 'Saat mencatat pembelian bahan ke pemasok, Anda memilih statusnya lunas atau belum. Pilihan itu menentukan dua hal yang berbeda, dan inilah sumber kebingungan yang paling sering.',
      },
      {
        kind: 'flow',
        nodes: [
          'Catat pembelian',
          'Stok bertambah (selalu)',
          `${PAYMENT_STATUS_LABELS.PAID}? → Kas berkurang`,
          `${PAYMENT_STATUS_LABELS.UNPAID}? → Muncul di Utang`,
        ],
      },
      {
        kind: 'text',
        body: `Barangnya sudah di tangan, jadi stok bertambah apa pun statusnya. Uangnya baru berkurang kalau memang sudah dibayar. Pembelian ${PAYMENT_STATUS_LABELS.UNPAID} tidak menyentuh kas sama sekali — ia muncul sebagai tagihan di halaman Pelunasan Utang, dan kas baru berkurang saat Anda mencatat pembayarannya di sana.`,
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Ini sebabnya laporan laba rugi Anda tidak langsung anjlok setiap kali belanja besar dengan tempo. Biayanya tercatat saat uang benar-benar keluar.',
      },
    ],
  },
  {
    id: 'konsep-riwayat-terkunci',
    title: 'Kenapa laporan bulan lalu tidak ikut berubah',
    summary:
      'Menaikkan harga bahan hari ini tidak mengubah laba yang sudah tercatat. Ini fitur, bukan bug.',
    category: 'konsep',
    roles: ['OWNER'],
    covers: [],
    keywords: ['riwayat', 'historis', 'harga bahan naik', 'laba berubah'],
    blocks: [
      {
        kind: 'text',
        body: 'Setiap kali sebuah produk terjual, aplikasi menyimpan modal produk itu apa adanya pada detik penjualan — bukan mengambilnya ulang dari daftar harga bahan saat laporan dibuka.',
      },
      {
        kind: 'text',
        body: 'Akibatnya: kalau harga kopi naik hari ini, laba bulan lalu tetap seperti apa adanya, karena bulan lalu Anda memang membeli kopi dengan harga lama. Laporan lama tidak akan pernah berubah sendiri di belakang Anda.',
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Kalau Anda ingin melihat dampak harga baru, lihat laporan untuk periode setelah harga itu diubah.',
      },
    ],
  },
  {
    id: 'konsep-peran',
    title: 'Siapa boleh melakukan apa',
    summary: 'Tiga peran, tiga cakupan akses yang berbeda.',
    category: 'konsep',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    covers: [],
    keywords: ['peran', 'role', 'hak akses', 'kasir', 'admin', 'owner'],
    blocks: [
      {
        kind: 'terms',
        items: [
          {
            term: 'Kasir',
            definition:
              'Melayani penjualan di satu cabang yang ditugaskan, dan hanya melihat data cabang itu. Bisa mengajukan cuti. Tidak bisa membuat akun pengguna.',
          },
          {
            term: 'Admin',
            definition:
              'Mengelola data master dan rekonsiliasi bank untuk semua cabang. Tidak punya akses ke laporan, inventaris, pengeluaran, maupun pengelolaan pengguna.',
          },
          {
            term: 'Owner',
            definition:
              'Akses penuh ke seluruh halaman, dan satu-satunya peran yang bisa membuat atau menonaktifkan akun pengguna.',
          },
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Menu yang tidak boleh Anda buka tidak ditampilkan di sidebar. Kalau Anda merasa ada menu yang seharusnya ada tapi tidak terlihat, hubungi Owner — kemungkinan peran akun Anda perlu diubah.',
      },
    ],
  },

  // ─────────────────────────── Akun & Masuk ───────────────────────────
  {
    id: 'login',
    title: 'Masuk ke aplikasi',
    summary: 'Langkah login dan ke mana Anda diarahkan setelahnya.',
    category: 'akun',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    covers: [],
    keywords: ['login', 'masuk', 'kata sandi salah'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka halaman login OhMyPos di browser.',
          'Masukkan email dan kata sandi yang diberikan Owner.',
          'Klik "Masuk". Kalau email atau kata sandi salah akan muncul pesan error — coba lagi, atau minta Owner mengaturkan ulang kata sandi Anda.',
          'Anda diarahkan sesuai peran: Kasir ke Penjualan, Admin ke Data Master, Owner ke Dashboard.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Tidak ada pendaftaran mandiri. Semua akun dibuat oleh Owner.',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Ubah nama, kata sandi, atau hapus akun sendiri',
    summary: 'Pengaturan yang bisa Anda ubah sendiri tanpa bantuan Owner.',
    category: 'akun',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    covers: [],
    keywords: ['profil', 'ganti password', 'hapus akun'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Klik nama Anda di pojok kanan atas, lalu pilih "Profil Saya".',
          'Ubah nama: isi kolom pada bagian "Ubah Nama", klik "Simpan Nama".',
          'Ubah kata sandi: isi kata sandi lama dan baru, klik "Ubah Kata Sandi". Anda tetap masuk di perangkat ini, tapi keluar dari perangkat lain.',
          'Hapus akun: gulir ke bagian paling bawah, klik "Hapus Akun Saya", lalu konfirmasi.',
        ],
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Menghapus akun sendiri tidak dapat dibatalkan dan Anda langsung keluar. Riwayat transaksi yang pernah Anda buat tetap tersimpan — pembukuan tidak ikut terhapus.',
      },
    ],
  },

  // ─────────────────────────── Penjualan ───────────────────────────
  {
    id: 'pos-sale',
    title: 'Melayani penjualan',
    summary: 'Urutan lengkap dari memilih produk sampai struk tercetak.',
    category: 'penjualan',
    roles: ['KASIR', 'OWNER'],
    covers: ['/sales'],
    keywords: ['pos', 'kasir', 'jual', 'bayar', 'keranjang'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Penjualan" → "Transaksi Penjualan".',
          'Klik kartu produk yang dibeli pelanggan. Produk masuk ke daftar "Pesanan Anda" di panel kanan.',
          'Atur jumlah tiap baris dengan tombol tambah/kurang. Kalau ada kesepakatan harga berbeda, ubah lewat "Harga khusus" pada baris itu.',
          'Pilih metode pembayaran pada bagian "Metode pembayaran:" — tombol Bayar belum aktif sebelum ini dipilih.',
          'Klik "Bayar". Muncul konfirmasi "Penjualan tercatat".',
          'Klik "Transaksi baru" untuk melayani pelanggan berikutnya.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Kalau muncul "Belum ada akun pembayaran", berarti Owner belum menambahkan rekening atau kas mana pun. Penjualan tidak bisa diselesaikan sampai itu diisi.',
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Kalau stok bahan tidak mencukupi untuk pesanan, transaksi ditolak dan muncul peringatan. Ini disengaja — agar stok tercatat tidak pernah minus.',
      },
      {
        kind: 'text',
        body: 'Struk tidak otomatis tercetak. Ambil dari menu "Riwayat Transaksi" kapan saja lewat tombol "Struk" pada baris transaksinya.',
      },
    ],
  },
  {
    id: 'sales-history',
    title: 'Riwayat transaksi dan pembatalan penjualan',
    summary: 'Mencari transaksi lama, mencetak ulang struk, dan membatalkan.',
    category: 'penjualan',
    // Not ADMIN: the (pos) route group requires KASIR or OWNER, so an Admin
    // cannot open this page at all — even though the void API accepts them.
    roles: ['KASIR', 'OWNER'],
    covers: ['/sales/history'],
    keywords: ['struk', 'batal', 'void', 'refund', 'riwayat'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Penjualan" → "Riwayat Transaksi".',
          'Cari dengan kotak pencarian (id transaksi, cabang, kasir, atau akun), atau persempit dengan filter cabang dan rentang tanggal.',
          'Klik "Struk" pada sebuah baris untuk melihat dan mencetak ulang bukti pembayarannya.',
        ],
      },
      {
        kind: 'text',
        body: 'Membatalkan penjualan yang keliru: klik "Batalkan Penjualan" pada barisnya, lalu konfirmasi. Stok bahan dikembalikan dan uangnya dibalik otomatis. Transaksinya tidak dihapus — statusnya berubah menjadi "Dibatalkan" dan tetap terlihat di daftar.',
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Kasir tidak bisa membatalkan penjualan — mintalah Owner. Pembatalan hanya berlaku dalam 30 menit sejak transaksi dibuat, dan selalu untuk seluruh transaksi; tidak ada pembatalan sebagian. Lewat dari itu, catat koreksinya sebagai pengeluaran. Pembatalan tidak dapat diurungkan.',
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Kasir hanya melihat riwayat cabangnya sendiri. Owner melihat seluruh cabang dan bisa menyaringnya.',
      },
    ],
  },

  // ─────────────────────────── Data Master ───────────────────────────
  {
    id: 'products-recipes',
    title: 'Produk & Resep',
    summary: 'Daftar menu jualan dan takaran bahan tiap produk.',
    category: 'data',
    roles: ['ADMIN', 'OWNER'],
    covers: ['/master-data'],
    keywords: ['produk', 'menu', 'resep', 'takaran', 'harga jual'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Data Master" → "Produk & Resep".',
          'Klik tombol tambah untuk membuat produk baru: isi nama, kategori, dan harga jual.',
          'Setelah produk tersimpan, buka resepnya dan tambahkan bahan baku beserta takaran untuk satu porsi.',
          'Simpan. Mulai saat itu setiap penjualan produk tersebut akan mengurangi stok bahan sesuai takaran.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Takaran ditulis dalam satuan bahan bakunya. Kalau kopi dicatat dalam gram, tulis 18 untuk 18 gram — bukan 0,018 kg.',
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Produk yang sudah pernah terjual tidak bisa dihapus. Nonaktifkan saja supaya hilang dari layar Penjualan tanpa merusak riwayat penjualan yang memuatnya.',
      },
    ],
  },
  {
    id: 'raw-materials',
    title: 'Bahan Baku',
    summary: 'Mendaftarkan bahan, satuan, harga beli, dan batas stok menipis.',
    category: 'data',
    roles: ['ADMIN', 'OWNER'],
    covers: ['/master-data/raw-materials'],
    keywords: ['bahan', 'satuan', 'konversi', 'harga beli', 'ambang'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Data Master" → "Bahan Baku", lalu klik tambah.',
          'Isi nama bahan dan satuan penyimpanan — satuan terkecil yang Anda pakai di resep, misalnya gram atau ml.',
          'Isi satuan pembelian dan angka konversinya, misalnya beli per "kg" dengan konversi 1000 kalau stok dicatat dalam gram.',
          'Isi harga beli per satuan penyimpanan dan batas stok menipis.',
        ],
      },
      {
        kind: 'text',
        body: `Batas stok menipis menentukan kapan bahan berubah status dari ${STOCK_STATUS_LABELS.OK} menjadi ${STOCK_STATUS_LABELS.LOW} di halaman Stok Bahan Baku. Status ${STOCK_STATUS_LABELS.OUT} muncul ketika stok habis.`,
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Pisahkan dua satuan itu baik-baik. Kalau resep memakai gram tetapi harga diisi per kilogram, HPP seluruh produk yang memakai bahan itu akan meleset seribu kali lipat.',
      },
    ],
  },
  {
    id: 'expense-categories',
    title: 'Kategori Pengeluaran',
    summary: 'Pilihan kategori yang muncul saat mencatat pengeluaran umum.',
    category: 'data',
    roles: ['ADMIN', 'OWNER'],
    covers: ['/master-data/expense-categories'],
    keywords: ['kategori', 'biaya', 'listrik', 'sewa', 'gaji'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Data Master" → "Kategori Pengeluaran".',
          'Tambahkan kategori sesuai kebiasaan bisnis Anda, misalnya Listrik, Sewa, Gaji, atau Perlengkapan.',
          'Kategori ini yang nanti muncul di daftar pilihan saat mencatat Pengeluaran Umum.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Beberapa kategori bertanda sistem tidak bisa diubah atau dihapus. Kategori itu dipakai aplikasi untuk mencatat penjualan dan pembelian bahan secara otomatis; menghapusnya akan memutus pencatatan tersebut.',
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Rekening & Kas (Metode Pembayaran)',
    summary:
      'Tempat uang masuk dan keluar. Ini juga daftar tombol bayar di kasir.',
    category: 'data',
    roles: ['ADMIN', 'OWNER'],
    covers: ['/accounts'],
    keywords: ['rekening', 'kas', 'metode bayar', 'qris', 'bank', 'e-wallet'],
    blocks: [
      {
        kind: 'text',
        body: `Setiap akun di sini mewakili satu tempat uang: ${ACCOUNT_TYPE_LABELS.BANK} untuk rekening bank, ${ACCOUNT_TYPE_LABELS.CASH} untuk laci kasir, ${ACCOUNT_TYPE_LABELS.EWALLET} untuk dompet digital.`,
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Metode Pembayaran". Halamannya berjudul "Rekening & Kas".',
          'Tambahkan akun: isi nama yang dikenali kasir (misalnya "Tunai" atau "QRIS BCA"), jenisnya, dan saldo awal bila ada.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Nama yang Anda tulis di sini persis muncul sebagai pilihan metode pembayaran di layar kasir. Tulis sependek dan sejelas mungkin.',
      },
    ],
  },
  {
    id: 'reconciliation',
    title: 'Rekonsiliasi Bank',
    summary: 'Mencocokkan mutasi rekening bank dengan pembukuan aplikasi.',
    category: 'data',
    roles: ['ADMIN', 'OWNER'],
    covers: ['/reconciliation'],
    keywords: ['rekonsiliasi', 'mutasi', 'csv', 'pdf', 'mandiri', 'cocok'],
    blocks: [
      {
        kind: 'text',
        body: 'Tujuannya memastikan setiap uang yang benar-benar bergerak di rekening bank punya pasangannya di pembukuan — dan sebaliknya. Selisih yang tidak berpasangan itulah yang perlu ditelusuri.',
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Rekonsiliasi", pilih akun bank yang ingin dicocokkan.',
          'Impor mutasi rekening: berkas CSV, atau PDF e-statement Mandiri Livin.',
          'Aplikasi menyarankan pasangan yang cocok secara otomatis. Periksa saran itu satu per satu.',
          'Klik cocokkan untuk mengonfirmasi pasangan yang benar, atau lewati bila belum ada pasangannya.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'PDF hanya didukung untuk e-statement Mandiri Livin, dan berkas yang terkunci kata sandi akan ditolak — buka proteksinya dulu, atau pakai CSV. Bank lain: gunakan CSV.',
      },
    ],
  },

  // ─────────────────────────── Pengeluaran ───────────────────────────
  {
    id: 'expenses-general',
    title: 'Pengeluaran Umum',
    summary: 'Mencatat biaya operasional seperti listrik, sewa, atau gaji.',
    category: 'pengeluaran',
    roles: ['OWNER'],
    covers: ['/expenses'],
    keywords: ['biaya', 'operasional', 'listrik', 'sewa', 'gaji'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Pengeluaran" → "Pengeluaran Umum".',
          'Klik tambah, lalu isi tanggal, jumlah, kategori, dan akun sumber dananya.',
          'Tentukan lokasi: pilih "Cabang" bila biaya ini milik satu toko tertentu, atau "Umum" bila untuk kebutuhan bersama.',
          'Simpan. Kas pada akun yang dipilih langsung berkurang.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Lokasi menentukan laporan mana yang menanggung biaya ini. Biaya listrik toko Melati pilih cabang Melati; biaya langganan aplikasi untuk seluruh bisnis pilih Umum.',
      },
    ],
  },
  {
    id: 'purchases',
    title: 'Pembelian Bahan Baku',
    summary: 'Belanja ke pemasok, tunai maupun tempo.',
    category: 'pengeluaran',
    roles: ['OWNER'],
    covers: ['/expenses/purchases'],
    keywords: ['belanja', 'pemasok', 'supplier', 'nota', 'masuk stok'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Pengeluaran" → "Pembelian".',
          'Pilih pemasok. Kalau pemasoknya belum terdaftar, klik "+ Pemasok Baru" langsung dari form ini.',
          'Tentukan lokasi pembelian: "Umum" untuk belanja terpusat, atau "Cabang" bila memang untuk satu toko.',
          'Tambahkan baris bahan: pilih bahannya, isi jumlah dalam satuan pembelian, dan harga totalnya.',
          `Pilih status pembayaran ${PAYMENT_STATUS_LABELS.PAID} atau ${PAYMENT_STATUS_LABELS.UNPAID}, lalu simpan.`,
        ],
      },
      {
        kind: 'text',
        body: `Stok bertambah begitu pembelian disimpan, apa pun status pembayarannya. Bila ${PAYMENT_STATUS_LABELS.UNPAID}, tagihannya otomatis muncul di halaman Pelunasan Utang dan kas belum berkurang.`,
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Harga beli yang Anda masukkan di sini memperbarui harga bahan yang dipakai menghitung HPP penjualan berikutnya.',
      },
    ],
  },
  {
    id: 'payables',
    title: 'Pelunasan Utang',
    summary: 'Memantau tagihan pemasok dan mencatat pembayarannya.',
    category: 'pengeluaran',
    roles: ['OWNER'],
    covers: ['/expenses/payables'],
    keywords: ['utang', 'tagihan', 'jatuh tempo', 'cicil', 'bayar sebagian'],
    blocks: [
      {
        kind: 'text',
        body: 'Halaman ini berisi seluruh pembelian yang belum lunas. "Total Utang Terbuka" di atas adalah jumlah yang masih harus Anda bayar ke semua pemasok.',
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Pengeluaran" → "Utang".',
          'Saring berdasarkan pemasok atau status untuk menemukan tagihan yang dituju.',
          'Klik tombol pembayaran pada barisnya — muncul dialog "Catat Pembayaran Utang".',
          'Isi "Jumlah Bayar (Rp)", "Dibayar Dari Akun", dan "Tanggal Bayar". Catatan opsional.',
          'Simpan. Kas berkurang saat itu juga dan "Sisa Utang" berkurang sebesar pembayaran.',
        ],
      },
      {
        kind: 'terms',
        items: [
          {
            term: PAYABLE_STATUS_LABELS.OPEN,
            definition: 'Belum ada pembayaran sama sekali.',
          },
          {
            term: PAYABLE_STATUS_LABELS.PARTIALLY_SETTLED,
            definition:
              'Sudah dibayar sebagian; sisanya masih tercatat sebagai utang.',
          },
          {
            term: PAYABLE_STATUS_LABELS.SETTLED,
            definition: 'Sudah lunas, tidak ada sisa.',
          },
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Anda boleh membayar sebagian. Isi saja jumlah yang benar-benar dibayar; statusnya menyesuaikan sendiri.',
      },
    ],
  },

  // ─────────────────────────── Inventaris ───────────────────────────
  {
    id: 'inventory-summary',
    title: 'Stok Bahan Baku dan Stok Awal',
    summary: 'Memantau sisa bahan dan mencatat stok pembuka periode.',
    category: 'inventaris',
    roles: ['OWNER'],
    covers: ['/inventory'],
    keywords: ['stok', 'opname', 'stok awal', 'menipis', 'habis'],
    blocks: [
      {
        kind: 'text',
        body: `Tab "Ringkasan Pergerakan Stok" menunjukkan kondisi tiap bahan dengan status ${STOCK_STATUS_LABELS.OK}, ${STOCK_STATUS_LABELS.LOW}, atau ${STOCK_STATUS_LABELS.OUT}. Gunakan ini untuk memutuskan kapan harus belanja.`,
      },
      {
        kind: 'flow',
        nodes: ['Stok awal', '+ Pembelian', '− Terpakai penjualan', '= Sisa'],
        caption: 'Rumus yang dipakai setiap baris di halaman ini.',
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Inventaris" → "Ringkasan & Stok Awal".',
          'Untuk mencatat stok pembuka, pindah ke tab "Stok Awal".',
          'Isi jumlah fisik tiap bahan yang benar-benar ada saat Anda mulai memakai aplikasi, lalu simpan.',
        ],
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Isi Stok Awal sebelum mencatat penjualan pertama. Kalau tidak, stok akan langsung minus atau penjualan ditolak karena aplikasi menganggap bahan Anda nol.',
      },
    ],
  },
  {
    id: 'stock-movements',
    title: 'Riwayat Pergerakan Stok',
    summary: 'Bukti baris per baris di balik angka sisa stok.',
    category: 'inventaris',
    roles: ['OWNER'],
    covers: ['/inventory/movements'],
    keywords: ['pergerakan', 'mutasi stok', 'kartu stok', 'selisih'],
    blocks: [
      {
        kind: 'text',
        body: 'Setiap perubahan stok tercatat satu baris di sini, lengkap dengan sumbernya: Stok Awal, Pembelian, Penjualan, atau Penyesuaian. Kalau sisa stok terasa aneh, halaman inilah tempat menelusurinya.',
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Inventaris" → "Riwayat Pergerakan".',
          'Saring per bahan baku, cabang, arah (masuk/keluar), sumber, atau rentang tanggal.',
          'Ekspor ke berkas bila perlu dibandingkan dengan catatan manual.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Baris dengan cabang "Umum" berasal dari pembelian terpusat — bahan yang dibeli untuk dipakai bersama, bukan milik satu toko.',
      },
    ],
  },

  // ─────────────────────────── Laporan ───────────────────────────
  {
    id: 'dashboard',
    title: 'Membaca Dashboard',
    summary: 'Ringkasan harian bisnis begitu Anda masuk.',
    category: 'laporan',
    roles: ['OWNER'],
    covers: ['/dashboard'],
    keywords: ['dashboard', 'ringkasan', 'beranda'],
    blocks: [
      {
        kind: 'text',
        body: 'Dashboard merangkum penjualan, pengeluaran, dan kondisi stok terkini dalam satu layar. Angkanya dihitung ulang setiap kali halaman dibuka, jadi selalu mencerminkan kondisi terakhir.',
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Kartu profitabilitas cabang hanya memuat toko sungguhan. Transaksi berlokasi "Umum" tidak ikut di sana karena bukan milik cabang mana pun — angkanya tetap terhitung di laporan Laba Rugi.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Lima laporan dan kapan memakainya',
    summary:
      'Laba Rugi, Laba per Produk, Metode Bayar, Produk Terlaris, Pendapatan Harian.',
    category: 'laporan',
    roles: ['OWNER'],
    covers: [
      '/reports',
      '/reports/product-profit',
      '/reports/payment-methods',
      '/reports/top-products',
      '/reports/daily',
    ],
    keywords: ['laporan', 'laba rugi', 'profit', 'terlaris', 'harian'],
    blocks: [
      {
        kind: 'terms',
        items: [
          {
            term: 'Laba Rugi',
            definition:
              'Gambaran menyeluruh satu periode: pendapatan dikurangi HPP dan seluruh biaya. Mulailah dari sini.',
          },
          {
            term: 'Laba per Produk',
            definition:
              'Produk mana yang benar-benar menguntungkan. Yang laris belum tentu paling untung.',
          },
          {
            term: 'Pendapatan per Metode Bayar',
            definition:
              'Berapa yang masuk lewat tunai, QRIS, atau transfer. Berguna saat mencocokkan setoran bank.',
          },
          {
            term: '10 Produk Terlaris',
            definition: 'Yang paling sering terjual berdasarkan jumlah.',
          },
          {
            term: 'Pendapatan Harian',
            definition:
              'Pola harian dalam satu periode — melihat hari ramai dan hari sepi.',
          },
        ],
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Laporan", lalu pilih laporan yang diinginkan.',
          'Atur "Dari Tanggal" dan "Sampai Tanggal".',
          'Pilih cabang bila ingin dipersempit, atau biarkan "Semua Cabang" untuk total bisnis.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Pada filter cabang, "Semua Cabang" berarti tanpa penyaringan sama sekali dan sudah mencakup lokasi "Umum". Bacalah topik "Beda Umum dan Semua Cabang" bila keduanya masih terasa serupa.',
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Penjualan yang dibatalkan tidak dihitung sebagai pendapatan di laporan mana pun, meskipun barisnya tetap terlihat di Riwayat Transaksi.',
      },
    ],
  },

  // ─────────────────────────── Bisnis & Karyawan ───────────────────────────
  {
    id: 'business-profile',
    title: 'Profil Bisnis',
    summary: 'Nama, logo, dan alamat yang muncul di struk.',
    category: 'bisnis',
    roles: ['OWNER'],
    covers: ['/business'],
    keywords: ['logo', 'nama toko', 'alamat', 'struk'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Bisnis" → "Profil Bisnis".',
          'Perbarui nama, alamat, dan unggah logo.',
          'Simpan. Perubahan langsung terpakai pada struk yang dicetak berikutnya.',
        ],
      },
    ],
  },
  {
    id: 'users',
    title: 'Pengguna & Hak Akses',
    summary: 'Membuat akun karyawan dan menentukan cabangnya.',
    category: 'bisnis',
    roles: ['OWNER'],
    covers: ['/business/users'],
    keywords: ['karyawan', 'akun', 'kasir baru', 'nonaktif'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Bisnis" → "Pengguna".',
          'Klik tambah pengguna, lalu isi nama, email, kata sandi awal, dan peran.',
          'Untuk peran Kasir, cabang wajib dipilih — kasir hanya bisa bekerja di satu cabang.',
          'Memindahkan kasir ke cabang lain: klik edit pada barisnya, ganti cabangnya, simpan.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Hanya Owner yang bisa membuat atau menonaktifkan akun. Karyawan tidak bisa mendaftar sendiri.',
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Karyawan yang berhenti sebaiknya dinonaktifkan, bukan dihapus. Menonaktifkan memutus aksesnya tetapi menjaga riwayat transaksi yang pernah ia buat tetap utuh.',
      },
    ],
  },
  {
    id: 'branches',
    title: 'Cabang Toko dan Toko Utama',
    summary: 'Menambah toko baru dan menentukan mana yang jadi toko utama.',
    category: 'bisnis',
    roles: ['OWNER'],
    covers: ['/business/branches'],
    keywords: ['cabang', 'toko', 'toko utama', 'pusat', 'buka cabang'],
    blocks: [
      {
        kind: 'text',
        body: 'Toko pertama yang Anda buat otomatis ditandai "Toko Utama". Anda tidak perlu menyiapkan apa pun sebelumnya — buat saja toko yang ada sekarang, dan tambahkan cabang berikutnya kapan pun bisnis berkembang.',
      },
      {
        kind: 'steps',
        items: [
          'Buka menu "Bisnis" → "Cabang".',
          'Klik tambah, isi nama dan alamat toko.',
          'Untuk memindahkan penanda toko utama, klik "Jadikan toko utama" pada baris toko yang dituju lalu konfirmasi.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Penanda Toko Utama selalu melekat pada tepat satu toko. Memberikannya ke toko lain otomatis melepasnya dari toko sebelumnya.',
      },
      {
        kind: 'note',
        tone: 'warning',
        body: 'Toko yang masih punya kasir tidak bisa dihapus — pindahkan dulu karyawannya. Lokasi "Umum" juga tidak bisa diubah nama maupun dihapus, karena dipakai aplikasi untuk mencatat transaksi terpusat.',
      },
    ],
  },
  {
    id: 'devices',
    title: 'Perangkat Toko',
    summary: 'Mendaftarkan tablet kasir dan mengaktifkannya.',
    category: 'bisnis',
    roles: ['OWNER'],
    covers: ['/business/devices'],
    keywords: ['tablet', 'perangkat', 'aktivasi', 'device'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Bisnis" → "Perangkat", lalu klik tambah.',
          'Beri label yang mudah dikenali dan pilih cabang tempat perangkat itu dipakai.',
          'Perangkat baru berstatus "Menunggu Aktivasi".',
          'Klik "Salin tautan aktivasi", buka tautan itu di perangkat yang bersangkutan. Statusnya berubah menjadi "Aktif".',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Tautan aktivasi harus dibuka di perangkat yang akan dipakai, bukan di perangkat Anda — tautan itulah yang menandai perangkat tersebut.',
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Log Absensi Kasir',
    summary: 'Memantau kehadiran kasir per hari dan per cabang.',
    category: 'bisnis',
    roles: ['OWNER'],
    covers: ['/business/devices/attendance'],
    keywords: ['absensi', 'kehadiran', 'jam masuk', 'shift'],
    blocks: [
      {
        kind: 'steps',
        items: [
          'Buka menu "Bisnis" → "Log Absensi".',
          'Gunakan tampilan kalender untuk melihat pola kehadiran satu bulan sekaligus.',
          'Saring per cabang atau per karyawan untuk menelusuri satu orang.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        body: 'Absensi tercatat dari perangkat yang sudah diaktifkan. Kasir yang masuk dari perangkat belum terdaftar tidak akan muncul di sini.',
      },
    ],
  },
  {
    id: 'leave',
    title: 'Cuti',
    summary: 'Mengajukan cuti, dan meninjau pengajuan karyawan.',
    category: 'bisnis',
    roles: ['KASIR', 'OWNER'],
    covers: ['/business/leave-requests'],
    keywords: ['cuti', 'izin', 'libur', 'pengajuan'],
    blocks: [
      {
        kind: 'text',
        body: 'Untuk karyawan: buka menu "Cuti", klik "Ajukan Cuti Baru", isi tanggal mulai, tanggal selesai, dan alasan. Pantau hasilnya di "Riwayat Pengajuan".',
      },
      {
        kind: 'terms',
        items: [
          { term: 'Menunggu', definition: 'Sudah diajukan, belum ditinjau.' },
          { term: 'Disetujui', definition: 'Owner menyetujui pengajuan.' },
          { term: 'Ditolak', definition: 'Owner menolak pengajuan.' },
        ],
      },
      {
        kind: 'text',
        body: 'Untuk Owner: pengajuan baru muncul di daftar "Menunggu Persetujuan". Setujui atau tolak dari sana; seluruh keputusan tersimpan di "Histori Cuti Karyawan".',
      },
    ],
  },
];

export function getHelpSections(role: UserRole): HelpSection[] {
  return HELP_SECTIONS.filter((section) => section.roles.includes(role));
}

/** Flattens a section's prose so the search box can look inside it. */
function searchableText(section: HelpSection): string {
  const parts: string[] = [
    section.title,
    section.summary,
    ...(section.keywords ?? []),
  ];
  for (const block of section.blocks) {
    switch (block.kind) {
      case 'text':
      case 'note':
        parts.push(block.body);
        break;
      case 'steps':
        parts.push(...block.items);
        break;
      case 'terms':
        for (const item of block.items) {
          parts.push(item.term, item.definition);
        }
        break;
      case 'flow':
        parts.push(...block.nodes, block.caption ?? '');
        break;
    }
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Filters sections by a free-text query. Searches the whole body, not just
 * titles — someone who does not know a feature's name is exactly the person
 * who needs the search box.
 */
export function filterHelpSections(
  sections: HelpSection[],
  query: string,
): HelpSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;
  return sections.filter((section) => searchableText(section).includes(needle));
}

/** Sections of one category, in declaration order. */
export function groupHelpSections(
  sections: HelpSection[],
): { category: HelpCategory; sections: HelpSection[] }[] {
  return HELP_CATEGORY_ORDER.map((category) => ({
    category,
    sections: sections.filter((section) => section.category === category),
  })).filter((group) => group.sections.length > 0);
}
