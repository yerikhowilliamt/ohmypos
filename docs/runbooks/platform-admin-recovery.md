# Runbook: Pemulihan akses konsol platform (super admin)

**Kapan dipakai:** tidak ada seorang pun yang bisa masuk ke `/platform/login`.

**Untuk siapa:** operator platform OhMyPos. Kalau yang terkunci adalah **Owner sebuah
tenant**, bukan super admin, jangan pakai dokumen ini — buka
`/platform/tenants/<id>` dan tekan **Reset kata sandi Owner**.

---

## 0. Tentukan dulu mana kasusnya

| Yang terjadi | Jalannya |
|---|---|
| Masih bisa masuk, hanya ingin mengganti kata sandi | Sidebar konsol → **Ganti kata sandi**. Butuh kata sandi lama. Tidak perlu runbook ini. |
| Lupa kata sandi, **tapi** ada super admin lain yang masih bisa masuk | Super admin lain menjalankan §2 dari mesinnya. Bisa juga langsung §2 sendiri. |
| Lupa kata sandi dan **tidak ada** super admin lain | §2. Ini satu-satunya jalan. |
| Belum ada akun super admin sama sekali | `pnpm --filter api create:platform-admin` (bukan skrip reset). |

Tidak ada pemulihan lewat email di sistem ini, dan itu disengaja — lihat
`docs/plannings/2026-08-30-pemulihan-kata-sandi.md` §0.1.

---

## 1. Yang perlu disiapkan

1. **Checkout repo ini di mesin lokal**, dengan `pnpm install` sudah pernah jalan.
   Skrip pemulihan **tidak ada di dalam image produksi** — runtime stage
   `apps/api/Dockerfile` hanya menyalin `dist`, `prisma`, `src/generated`,
   `package.json`, dan `node_modules`; `scripts/` tidak ikut. Jadi ini dijalankan
   dari luar Render, bukan dari shell Render.
2. **External Database URL** milik database Render:
   dashboard Render → database OhMyPos → tab **Info** → **External Database URL**.
   Pakai yang *External*, bukan *Internal* — Internal hanya bisa dijangkau dari
   dalam jaringan Render.
3. **IP Anda diizinkan.** Di halaman database yang sama, **Access Control** →
   tambahkan IP publik mesin Anda. Tanpa ini koneksi akan menggantung lalu timeout,
   bukan menolak dengan pesan jelas.
4. **Email akun super admin** yang mau direset. Kalau lupa, §4 punya cara melihatnya.

---

## 2. Reset kata sandinya

```bash
DATABASE_URL="<External Database URL dari dashboard Render>" \
  pnpm --filter api reset:platform-admin-password
```

Skrip akan menanyakan email dan kata sandi baru. Kata sandinya tidak ditampilkan
saat diketik, tidak dicetak setelahnya, dan tidak masuk ke log mana pun.

Bisa juga non-interaktif — tapi ingat perintah ini akan tersimpan di riwayat
shell Anda beserta kata sandinya:

```bash
DATABASE_URL="<External Database URL>" \
  pnpm --filter api reset:platform-admin-password \
  --email operator@contoh.com --password "KataSandiBaruMinimal12"
```

**Aturan kata sandi:** minimal 12 karakter, sama dengan ambang saat akun super
admin pertama dibuat. Satu sesi di konsol ini menjangkau setiap tenant, jadi
ambangnya lebih tinggi daripada 8 karakter milik pengguna tenant.

Keluaran yang benar:

```
Kata sandi SUPER ADMIN berhasil direset:
- Email : operator@contoh.com
- Waktu : 2026-08-30T14:38:03.747Z

Seluruh sesi lama akun ini sudah dicabut. Masuk melalui /platform/login.
```

Baris "seluruh sesi lama dicabut" itu bukan basa-basi: skrip menulis
`refresh_token_hash = NULL` dan menaikkan `token_valid_from`, jadi setiap access
token dan refresh token yang sudah beredar untuk akun itu langsung mati.
Kalau sebuah sesi lama masih hidup setelah ini, sesuatu tidak berjalan — jangan
diabaikan.

---

## 3. Verifikasi

1. Buka `https://<domain web>/platform/login`.
2. Masuk dengan email dan kata sandi baru. Harus berhasil.
3. Kalau ada perangkat lain yang tadinya masih terbuka di konsol, muat ulang
   halamannya — perangkat itu harus terlempar ke halaman login.

---

## 4. Kalau emailnya sendiri sudah lupa

```bash
psql "<External Database URL>" \
  -c "SELECT email, is_active, created_at FROM platform_admins ORDER BY created_at;"
```

Jangan pernah `SELECT password_hash` — tidak ada gunanya dan hanya menaruh hash
di riwayat terminal.

Kalau tabelnya kosong, tidak ada yang bisa direset. Buat akun baru:

```bash
DATABASE_URL="<External Database URL>" pnpm --filter api create:platform-admin
```

---

## 5. Setelah selesai

- Sampaikan kata sandi baru lewat jalur terpisah (bukan email biasa, bukan chat
  grup yang sama dengan tempat masalahnya dilaporkan).
- Hapus perintah non-interaktif dari riwayat shell kalau Anda memakainya:
  `history -d <nomor>` di bash, atau sunting `~/.zsh_history` di zsh.
- Pertimbangkan mencabut kembali izin IP Anda di Access Control database Render
  kalau tadi ditambahkan hanya untuk keperluan ini.
