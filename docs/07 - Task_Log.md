# OhMyPos — Task Log

**Purpose:** Give the next AI coding session (or the next you) the context of what was actually done, decided, and left unfinished — without needing to re-read the entire PRD/System Design/ADR/ERD/Playbook every time. Every completed (or abandoned) task gets an entry here.

**Depends on:** PRD v1.1, System Design v4, ADR-001–012, ERD v3, Engineering Playbook v3

---

## How to use this log

- Add one entry per task, in reverse-chronological order (newest at the top).
- A "task" is whatever unit of work was actually handed to an AI agent or worked on in one sitting — a phase, a module, a single bugfix, a schema change. Don't force artificial task boundaries; log at the granularity work actually happened.
- Fill every field. If a field genuinely doesn't apply, write "N/A" rather than omitting it — an omitted field is ambiguous (forgotten vs. not applicable) to whoever reads this next.
- The "Handoff Notes" field is the most important one — write it for a reader who has *not* seen this conversation, only this log entry plus the standing docs (PRD/System Design/ADR/ERD/Playbook).
- Reference ADRs/System Design sections by number/section, don't restate their content here — this log is for what happened in a specific task, not a second copy of the architecture docs.

---

## Entry Template

```
### TASK-XXX — <short title>

- **Date:** YYYY-MM-DD
- **Module / Phase:** <e.g. Sale module, ERD implementation, apps/web scaffolding>
- **Objective:** <what this task was asked to do, one or two sentences>
- **Relevant docs:** <ADR/System Design/ERD sections this task implements or depends on>
- **What was done:** <concrete summary — files created/changed, endpoints added, schema
  migrations run>
- **Decisions made during this task:** <any small implementation decision that came up
  and wasn't already covered by an ADR — e.g. exact Zod refinement used for Decimal
  strings, exact NestJS-Zod integration library chosen (see ADR-010's note). If a
  decision was significant enough to need its own ADR, write it there instead and just
  link it here.>
- **Status:** Done | Blocked | In Progress
- **Handoff notes:** <what the next task needs to know — unfinished edges, follow-up
  work, anything that looked risky but was out of scope for this task>
```

---

## Log

### TASK-044 — Help / Documentation Page (Phase 13)

- **Date:** 2026-08-20
- **Module / Phase:** Documentation / Help Page (Phase 13)
- **Objective:** Provide a dedicated role-aware Help/Documentation ("Bantuan") page with step-by-step guidance rendered through accessible accordion components without introducing new dependencies or MDX pipelines.
- **Relevant docs:** `docs/plannings/phase-13-help-page.md`, AGENTS.md, DESIGN.md
- **What was done:**
  - Added Accordion component in `packages/ui/src/components/ui/accordion.tsx` wrapping `radix-ui` Accordion primitives.
  - Authored structured static typed guide data in `apps/web/lib/help-content.ts` with role-based filtering (`getHelpSections`).
  - Created shared help page `apps/web/app/(shared)/help/page.tsx` and client component `HelpClient.tsx`.
  - Updated `apps/web/lib/nav-config.ts` to include `/help` in navigation for `KASIR` and `OWNER` (omitting sidebar link for `ADMIN` per AGENTS.md constraints while keeping URL accessible).
  - Updated unit tests in `apps/web/lib/nav-config.test.ts`.
  - Ran turbo lint, typecheck, and full test suite across workspace.
  - Verified live E2E rendering and role-based filtering for `OWNER`, `KASIR`, and `ADMIN` via Playwright.
- **Status:** Done
- **Handoff notes:**
  - Next phases in HR-lite/backlog can proceed independently.

### TASK-043 — Attendance Monthly Calendar & Leave Matrix

- **Date:** 2026-08-20
- **Module / Phase:** Devices & Attendance Tracking / Cuti (Phase 11 & 12 Integration)
- **Objective:** Provide a monthly attendance calendar grid/matrix (Option 1) mapping each cashier to days 1..31 with status indicators (Hadir Valid, Pelanggaran, Cuti/Izin Disetujui, Libur/Kosong) and interactive popover details.
- **Relevant docs:** ADR-021, PRD §5.4
- **What was done:**
  - Created `AttendanceCalendarMatrix` component (`apps/web/app/(back-office)/devices/AttendanceCalendarMatrix.tsx`).
  - Integrated `useUsers`, `useAttendanceRecords`, and `useAllLeaveRequests` to cross-reference daily cashier presence with official approved leaves.
  - Implemented day popover showing login timestamp, device label, and leave reasons.
  - Added tab switcher in `apps/web/app/(back-office)/devices/attendance/AttendanceClient.tsx` (Kalender Matriks & Riwayat Log Detail).
  - Verified live E2E via Playwright and saved screenshot to `docs/screenshoots/attendance-calendar-matrix.png`.
- **Status:** Done

### TASK-042 — Attendance Status Manual Override by Owner

- **Date:** 2026-08-20
- **Module / Phase:** Devices & Attendance Tracking (Phase 11 Extension)
- **Objective:** Allow Owner to manually update/correct attendance validity status (e.g. override system errors, mark as Valid or specific Violation reason) via `PATCH /devices/attendance/:id`.
- **Relevant docs:** ADR-021, AGENTS.md
- **What was done:**
  - Added `UpdateAttendanceStatusSchema` in `@ohmypos/api-contracts`.
  - Added `updateStatus` method in `AttendanceService` and endpoint `PATCH /devices/attendance/:id` in `DevicesController` (OWNER-only).
  - Added `useUpdateAttendanceStatus` mutation in `apps/web/hooks/useDevices.ts`.
  - Added row action DropdownMenu in `AttendanceLogTable.tsx` allowing Owner to toggle record validity ("Tandai Sebagai Valid", "Tandai: HP Pribadi", "Tandai: Salah Cabang", "Tandai: Tak Terdaftar").
  - Verified live E2E in browser via Playwright and captured screenshot to `docs/screenshoots/attendance-status-override-menu.png`.
- **Status:** Done

### TASK-041 — Dashboard Compact Branch Profitability Card

- **Date:** 2026-08-20
- **Module / Phase:** Dashboard UI
- **Objective:** Consolidate branch profitability into a single clean minimalist card showing top 3 branches with branch name, Profit/Loss badge, and total omset/revenue.
- **Relevant docs:** PRD §5.4, DESIGN.md
- **What was done:**
  - Simplified `apps/web/components/dashboard/BranchProfitabilityCard.tsx` into a single compact card showing max 3 operational branches sorted by omset.
  - Displayed essential info: Nama Cabang, Badge Status (`Profit` / `Tidak Profit`), Omset per cabang, dan progress bar horizontal minimalis.
  - Verified live rendering in Playwright, and passed all linter, typecheck, and unit tests across workspace.
  - Captured screenshot in `docs/screenshoots/dashboard-branch-profitability-single-card.png`.
- **Status:** Done

### TASK-040 — Dashboard Branch Profitability Horizontal Bar Chart

- **Date:** 2026-08-20
- **Module / Phase:** Dashboard & Reports
- **Objective:** Convert the branch profitability card from a data table into an analytical Horizontal Bar Chart with custom tooltips (Revenue, Net Profit, Margin %) and inflow/outflow conditional color fills.
- **Relevant docs:** PRD §5.4, DESIGN.md §36/§37
- **What was done:**
  - Refactored `apps/web/components/dashboard/BranchProfitabilityCard.tsx` from `@ohmypos/ui` Table to Recharts `BarChart` (`layout="vertical"`).
  - Configured XAxis numeric with compact Indonesian numbers and YAxis with branch names.
  - Added conditional bar fill colors: emerald green (`--color-accent-inflow`) for profit branches (net profit >= 0) and red (`--color-accent-outflow`) for loss branches.
  - Added rich analytical tooltip detailing Pendapatan, Laba Bersih, dan Margin %.
  - Verified live rendering via Playwright and saved screenshot to `docs/screenshoots/dashboard-branch-profitability-barchart.png`.
- **Decisions made during this task:**
  - Dynamic bar chart height based on the number of operational branches (`Math.max(220, branchResults.length * 60 + 50)`).
- **Status:** Done

### TASK-039 — Dashboard Branch Profitability Card

- **Date:** 2026-08-20
- **Module / Phase:** Dashboard & Reports
- **Objective:** Display branch profitability metrics (Revenue, COGS, Opex, Net Profit, Margin %, Profit/Loss badge status) on the main Owner Dashboard.
- **Relevant docs:** PRD §5.4, ADR-014, ADR-017
- **What was done:**
  - Created `BranchProfitabilityCard` component (`apps/web/components/dashboard/BranchProfitabilityCard.tsx`).
  - Integrated real-time query per operational branch to `useProfitLoss({ startDate, endDate, branchId })`.
  - Filtered out the Central/Pusat kitchen inventory pool, displaying retail selling branches.
  - Added summary status badges: Profit (emerald), Rugi/Tidak Profit (destructive), Impas (outline), and margin breakdown.
  - Embedded into `apps/web/components/dashboard/DashboardClient.tsx`.
  - Verified live via Playwright E2E and saved screenshot to `docs/screenshoots/dashboard-branch-profitability.png`.
- **Decisions made during this task:**
  - Used `@ohmypos/ui` shadcn `Table`, `Badge`, `Card`, and `Skeleton` primitives.
- **Status:** Done

### TASK-038 — Recipe Decimal Parsing & E2E Playwright Verification

- **Date:** 2026-08-20
- **Module / Phase:** Master Data (Recipe/BOM) & E2E Testing
- **Objective:** Fix decimal input validation for recipe ingredients supporting comma format ("0,025") and dot format ("0.025"), verify live in browser via Playwright.
- **Relevant docs:** ADR-010, ADR-012, Playbook §5
- **What was done:**
  - Updated `decimalString` in `packages/api-contracts/src/primitives.ts` to accept `/^-?\d+(?:[.,]\d+)?$/` and sanitize comma to dot via transform.
  - Updated `RecipeEditorDialog.tsx` to sanitize input strings before mutation submission.
  - Verified live E2E browser flow via Playwright: logged in as Owner, opened Product & Recipe table, edited recipes for Air Mineral and Burger using decimal quantities with commas (`0,05`) and dots (`0.03`), successfully computed Live HPP and Margins without any validation errors.
  - Captured verification screenshot in `docs/screenshoots/master-data-updated-recipe.png`.
- **Decisions made during this task:**
  - Comma and dot inputs are both supported seamlessly across API contracts.
- **Status:** Done

### TASK-037 — Product Photo Upload & Display

- **Date:** 2026-08-20
- **Module / Phase:** Master Data & POS (Products)
- **Objective:** Enable OWNER/ADMIN to upload product photos to Cloudinary and display product photos in Master Data Table, Form Dialog, and POS cards.
- **Relevant docs:** ADR-020 (Cloudinary Pattern), AGENTS.md, PRD §5.1
- **What was done:**
  - Added `photoUrl String? @map("photo_url")` to `Product` model in `apps/api/prisma/schema.prisma` and applied migration `20260820013927_add_product_photo_url`.
  - Updated `@ohmypos/api-contracts` (`ProductResponseSchema` with `photoUrl: z.string().nullable().optional()`).
  - Added `ProductPhotoService` in `apps/api/src/modules/products/product-photo.service.ts` with unit test in `product-photo.spec.ts`.
  - Added `POST /products/:id/photo` endpoint with `FileInterceptor` in `ProductsController` (OWNER/ADMIN only).
  - Updated `useMasterData.ts` in `apps/web` with `useUploadProductPhoto` mutation.
  - Updated `ProductFormDialog` with photo upload selector/preview and multipart upload integration.
  - Updated `ProductsTable` to show product image thumbnail in the product column.
  - Updated POS `ProductCard` to render product image banner.
  - Verified tests, lint, and typechecks across monorepo.
- **Decisions made during this task:**
  - Cloudinary public ID follows deterministic pattern `product_<productId>` with `overwrite: true` to prevent orphan image storage.
- **Status:** Done
- **Handoff notes:**
  - Standard Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) in API env are shared with user profile photo uploads.

### TASK-036 — Phase 12: Leave Requests (Cuti)

- **Date:** 2026-08-20
- **Module / Phase:** Phase 12 — Leave Requests (Cuti)
- **Objective:** Enable employees (KASIR) to submit leave requests and view submission history, while providing an OWNER-only review and approval/rejection queue.
- **Relevant docs:** ADR-021, `docs/plannings/phase-12-leave-requests.md`, AGENTS.md
- **What was done:**
  - Added Prisma model `LeaveRequest` and enum `LeaveRequestStatus` in `apps/api/prisma/schema.prisma` with relations to `User` (`leaveRequests`, `reviewedLeaveRequests`), and applied migration `20260820010402_add_leave_requests`.
  - Added API contracts in `packages/api-contracts/src/leave-request.schema.ts` (`CreateLeaveRequestSchema`, `LeaveRequestListQuerySchema`, `LeaveRequestResponseSchema`) and exported in `index.ts`.
  - Implemented backend module `apps/api/src/modules/leave-requests/` (`leave-requests.exceptions.ts`, `leave-requests.dto.ts`, `leave-requests.service.ts`, `leave-requests.controller.ts`, `leave-requests.module.ts`).
  - Registered `LeaveRequestsModule` in `apps/api/src/app.module.ts`.
  - Created frontend React Query hooks in `apps/web/hooks/useLeaveRequests.ts`.
  - Built frontend UI under `apps/web/app/(shared)/leave-requests/` (`page.tsx`, `LeaveRequestsClient.tsx`, `MyLeaveRequests.tsx`, `OwnerReviewQueue.tsx`).
  - Updated `apps/web/lib/nav-config.ts` to include `/leave-requests` for `KASIR` and `OWNER`, and updated `nav-config.test.ts`.
  - Added full e2e test suite in `apps/api/test/leave-requests.e2e-spec.ts` covering submission, self-listing, date validation, RBAC restrictions (KASIR forbidden from all/review), and Owner approval/rejection workflows.
  - Verified with unit tests, e2e tests, linter, and typecheck across the monorepo.
- **Decisions made during this task:**
  - Leave dates are calendar days (`@db.Date`), validated with `startDate <= endDate` at the contract schema level.
  - Review queue for Owner defaults to `PENDING` items for simple triage in v1.
- **Status:** Done
- **Handoff notes:**
  - Phase 12 fully complete and tested.

### TASK-035 — Phase 11: Attendance & Device Tracking

- **Date:** 2026-08-19
- **Module / Phase:** Phase 11 — Attendance & Device Tracking
- **Objective:** Track KASIR login timestamp and physical device validity using signed HttpOnly device cookies activated via an authenticated OWNER ceremony; surface attendance violations as non-blocking login warning banners.
- **Relevant docs:** ADR-021, `docs/plannings/phase-11-attendance-device-tracking.md`, AGENTS.md
- **What was done:**
  - Added ADR-021 in `docs/02 - ADR.md` documenting scope expansion for Attendance/Device Tracking & Leave Requests.
  - Added Prisma models `Device`, `AttendanceRecord`, and enum `AttendanceViolationReason` in `apps/api/prisma/schema.prisma` and applied migration `20260819151056_add_devices_and_attendance`.
  - Implemented HMAC-SHA256 device cookie signing & timing-safe verification utility (`apps/api/src/common/utils/device-cookie.util.ts`) with Jest unit tests.
  - Added device contracts (`packages/api-contracts/src/device.schema.ts`) and extended `LoginResponseSchema` with `attendance` field in `packages/api-contracts/src/auth.schema.ts`.
  - Built `devices` backend module (`devices.controller.ts`, `devices.service.ts`, `attendance.service.ts`, `devices.dto.ts`, `devices.exceptions.ts`, `devices.module.ts`).
  - Integrated `AttendanceService` into `AuthService.login()` and `AuthController.login()` to inspect cookies for `KASIR` logins and record attendance.
  - Registered `DevicesModule` in `apps/api/src/app.module.ts` and set cookie constants (`DEVICE_COOKIE`, `DEVICE_COOKIE_MAX_AGE`).
  - Built frontend pages and components: `/devices` listing with `AddDeviceDialog`, `/devices/attendance` log monitoring page with `AttendanceLogTable`, `/devices/activate` page, `useDevices` and `useAttendanceRecords` hooks, updated `nav-config.ts` (adding `/devices` with submenus `Daftar Perangkat` & `Log Absensi` for OWNER) and `nav-config.test.ts`, plus non-blocking attendance warning banner on `/login`.
  - Refactored `/devices` and `/devices/attendance` UI to replace native elements and custom tables with `@ohmypos/ui` shadcn primitives (`Badge`, `Checkbox`, `Select`, `Table`) and TanStack `DataTable` with client-side search and sorting.
  - Added `GET /devices/attendance` endpoint for real-time Owner monitoring of cashier login times, device names, and violation statuses with branch and violation filters.
  - Verified with unit tests, linting, and typechecks across all packages.
- **Decisions made during this task:**
  - `Device` scoped to `Branch`, not `User` (terminals shared per branch).
  - Attendance recording is strictly for `KASIR` logins; `ADMIN` and `OWNER` logins return `attendance: null`.
  - Login always succeeds for valid credentials; unregistered or mismatched device results in `isValid: false` warning banner rather than login failure.
  - Owner activation endpoint `POST /devices/activate` requires authenticated OWNER role rather than public endpoint.
- **Status:** Done
- **Handoff notes:**
  - Documented accepted residual risk in `08 - Tech_Debt_Log.md`: cashier with physical dev tools access could extract and copy the device cookie to a personal device.
  - Ready for Phase 12 (Leave Requests) which builds on ADR-021 and existing `(shared)` route group patterns.

### TASK-034 — Phase 10b: Profile Photo Upload (Cloudinary)

- **Date:** 2026-08-19
- **Module / Phase:** Phase 10b — Profile Photo Upload
- **Objective:** Implement self-service profile photo upload using Cloudinary for storage and transformation, adding `User.photoUrl` and `POST /auth/me/photo`.
- **Relevant docs:** ADR-020, ERD §7 Note 4 (Superseded), PRD v1.1
- **What was done:**
  - Authored and approved ADR-020 reversing ERD §7 Note 4.
  - Added `cloudinary` dependency to `apps/api`.
  - Updated `apps/api/prisma/schema.prisma` with `photoUrl String? @map("photo_url")` on `User` model, generated and executed migration `20260819141846_add_user_photo_url`.
  - Updated `@ohmypos/api-contracts` (`UserResponseSchema` with `photoUrl: z.string().nullable()`, `UploadPhotoResponseSchema`).
  - Added `ProfilePhotoService`, `InvalidImageFileException`, and `POST /auth/me/photo` in `apps/api`.
  - Updated `AuthService` and `UsersService` to include `photoUrl` in response mapping.
  - Added `useUploadPhoto` mutation hook and `PhotoForm` component in `apps/web`.
  - Set Cloudinary upload target folder to `ohmypos` with public ID format `user_<userId>`.
  - Updated CSP headers in `apps/web/next.config.ts` to allow `https://res.cloudinary.com` under `img-src`.
  - Added profile photo avatar rendering to `Sidebar.tsx`.
  - Removed server-side thumbnail crop transformation in `ProfilePhotoService` so the original photo is preserved intact in Cloudinary.
  - Added unit test `profile-photo.spec.ts`.
- **Decisions made during this task:**
  - Cloudinary public ID is deterministic (`ohmypos/user_<userId>`) with `overwrite: true` to avoid orphan image accumulation.
  - Storing original aspect ratio without server-side crop; circular/square presentation handled in frontend CSS.
- **Status:** Done
- **Handoff notes:** Requires real `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in environment variables when deployed.

### TASK-033 — Remove Redundant Branch Label from Topbar

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Layout Shell (`Topbar.tsx`, `AppShell.tsx`)
- **Objective:** Hapus label "Semua Cabang" / "Cabang Terkunci" dari Topbar karena data bersifat terpusat (ADR-004) dan filter cabang sudah tersedia secara lokal di modul yang relevan (Laporan & Riwayat Penjualan).
- **Relevant docs:** DESIGN.md §17, ADR-004
- **What was done:**
  1. Menghapus helper `branchLabel` dan elemen teks cabang dari `Topbar.tsx`.
  2. Menyembunyikan topbar pada layar desktop (`md:hidden`) karena fungsi profil dan menu telah berpindah penuh ke sidebar.
  3. Memperbarui `AppShell.tsx` dan memverifikasi lint, typecheck, dan unit test.
- **Status:** Done
- **Handoff notes:** Lolos lint, typecheck, dan seluruh unit test.

### TASK-032 — Refactor Sidebar Footer Layout with Explicit Settings, Logout, and User Info

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Layout Shell (`Sidebar.tsx`)
- **Objective:** Hilangkan dropdown pada avatar user di footer sidebar; susun secara vertikal: tombol Pengaturan (`/profile`), tombol Keluar (Logout), lalu kartu info statis profil user (foto/avatar, nama, dan role).
- **Relevant docs:** DESIGN.md §16–18, PRD §5
- **What was done:**
  1. Menghapus wrapper `DropdownMenu` dari kartu user di sidebar.
  2. Menambahkan tombol navigasi link `Pengaturan` (`/profile`) dengan icon `Settings`.
  3. Menambahkan tombol aksi `Keluar` (`Logout`) langsung dengan icon `LogOut` berwarna merah (danger) di bawah tombol pengaturan.
  4. Menempatkan kartu informasi statis identitas profil user di urutan paling bawah (avatar inisial, nama user, dan label role).
- **Status:** Done
- **Handoff notes:** Lint, typecheck, dan unit test seluruhnya lulus.

### TASK-031 — Move User Profile & Role to Sidebar Footer

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Layout Shell (`Sidebar.tsx`, `Topbar.tsx`, `AppShell.tsx`)
- **Objective:** Pindahkan identitas profil user dari topbar ke footer bawah sidebar dengan avatar inisial, nama user, role label, dan popup menu aksi (Profil & Logout).
- **Relevant docs:** DESIGN.md §16–18, PRD §5
- **What was done:**
  1. Menghapus dropdown profile dari `Topbar.tsx` dan menyederhanakan topbar menjadi hanya indikator cabang & mobile menu button.
  2. Menambahkan user identity footer di `Sidebar.tsx` (paling bawah): avatar lingkaran inisial, nama user, role badge, serta chevron selector.
  3. Mengintegrasikan popup `DropdownMenu` (Profil Saya & Logout) di footer sidebar.
  4. Mengupdate `AppShell.tsx` agar mengalirkan prop `user: UserResponse` ke `Sidebar`.
- **Status:** Done
- **Handoff notes:** Lint, typecheck, dan unit test (40 test file, 257 passed) lulus.

### TASK-030 — Enhance Back-Office Dashboard with Rich Visualizations & Donut Payment Chart

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Dashboard (`DashboardClient.tsx`, `ReportChart.tsx`)
- **Objective:** Tingkatkan kepadatan informasi halaman dashboard dengan menambahkan diagram lingkaran (donut chart) porsi metode pembayaran (dalam persentase & nominal), peringkat 5 produk terlaris, feed transaksi terkini, serta card peringatan aksi cepat (bahan baku menipis & utang terbuka).
- **Relevant docs:** DESIGN.md, PRD §5.4
- **What was done:**
  1. Menambahkan komponen `ReportPieChart` pada `ReportChart.tsx` berbasis Recharts `PieChart`, `Pie`, dan `Cell` lengkap dengan tooltip persentase dan nominal terformat.
  2. Memperbarui `DashboardClient.tsx` untuk mengonsumsi data `useIncomeByPaymentMethod`, `useTopProducts`, `useSales` (recent sales), `useInventorySummary`, dan `usePayablesSummary`.
  3. Menyusun layout grid 2 baris yang informatif dan responsif:
     - Baris 1: Ringkasan KPI Utama (Kas, Laba Bersih, Utang, Stok).
     - Baris 2: Tren Pendapatan Harian (Line Chart) + Diagram Lingkaran Metode Pembayaran (Donut Chart dengan legend persentase).
     - Baris 3: Top 5 Produk Terlaris, Feed Transaksi Kasir Terkini, dan Status Perhatian / Aksi Operasional (Low Stock & Utang Supplier).
- **Status:** Done
- **Handoff notes:** Lint, typecheck, dan unit test lolos.

### TASK-029 — Collapsible Sidebar & Mobile Navigation for Sub-routes

- **Date:** 2026-08-19
- **Module / Phase:** apps/web UI shell navigation (`Sidebar.tsx`, `MobileNavDrawer.tsx`, `@ohmypos/ui/collapsible`)
- **Objective:** Buat parent sidebar dengan sub-menu dapat di-expand/collapse ketika diklik menggunakan komponen shadcn Collapsible.
- **Relevant docs:** DESIGN.md, PRD §5
- **What was done:**
  1. Menambahkan komponen shadcn UI `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` di `packages/ui/src/components/ui/collapsible.tsx` berbasis Radix UI.
  2. Mengubah `Sidebar.tsx` dan `MobileNavDrawer.tsx` agar menggunakan `Collapsible` dengan chevron icon indikator animasi rotasi.
  3. Menangani auto-expand ketika user berada di dalam active sub-route sambil tetap mengizinkan toggle buka-tutup manual.
- **Status:** Done
- **Handoff notes:** Lolos lint, typecheck, dan seluruh unit test.

### TASK-028 — Split Back-Office Routes into Dedicated Sub-Routes

- **Date:** 2026-08-19
- **Module / Phase:** apps/web routing refactor (`/master-data`, `/expenses`, `/reports`)
- **Objective:** Pecah halaman back-office yang sebelumnya menggunakan internal client tabs menjadi URL sub-routes terpisah dengan navigasi sidebar bertingkat.
- **Relevant docs:** PRD §5, ADR-011, System Design v4 §5
- **What was done:**
  1. **Master Data Sub-routes:**
     - `/master-data`: Produk & Resep / BOM (`MasterDataClient` tab `products`)
     - `/master-data/raw-materials`: Bahan Baku (`MasterDataClient` tab `raw-materials`)
  2. **Expenses Sub-routes:**
     - `/expenses`: Pengeluaran Umum (`ExpensesClient` tab `general`)
     - `/expenses/purchases`: Pembelian Bahan Baku (`ExpensesClient` tab `purchases`)
     - `/expenses/payables`: Pelunasan Utang (`ExpensesClient` tab `payables`)
  3. **Reports Sub-routes:**
     - `/reports`: Laba Rugi (`ReportsClient` tab `profit-loss`)
     - `/reports/product-profit`: Laba per Produk
     - `/reports/payment-methods`: Pendapatan per Metode Bayar
     - `/reports/top-products`: 10 Produk Terlaris
     - `/reports/daily`: Pendapatan Harian
  4. **Navigasi & Filter:**
     - Memperbarui `nav-config.ts` dan `nav-config.test.ts` untuk sub-menu `Data Master`, `Pengeluaran`, dan `Laporan`.
     - Mempertahankan query params tanggal dan cabang (`startDate`, `endDate`, `branchId`) saat berpindah tab sub-route laporan.
- **Decisions made during this task:** Menggunakan navigasi berbasis Link untuk tab bar atas agar setiap halaman memiliki URL unik yang bookmarkable tanpa menghilangkan UX tab switching.
- **Status:** Done
- **Handoff notes:** Semua test (`vitest`), lint, dan typecheck lolos.

### TASK-027 — Split Sales Navigation, Sales History & Receipt Printing

- **Date:** 2026-08-19
- **Module / Phase:** Phase 8c Addendum / Sales History & Struk (`(pos)/sales/history`)
- **Objective:** Pisahkan menu Penjualan di sidebar menjadi sub-menu Transaksi Kasir (`/sales`) dan Riwayat Transaksi (`/sales/history`), serta sediakan UI preview & cetak struk (faktur kasir) dengan nama usaha dan cabang.
- **Relevant docs:** PRD §5.2, ADR-011, DESIGN.md
- **What was done:**
  1. **Navigasi Nested (`apps/web/lib/nav-config.ts`):** Menambahkan dukungan nested items `children` pada `NavItem`. Membuka menu sub-item Penjualan (`Transaksi Kasir` dan `Riwayat Transaksi`) untuk role `KASIR` dan `OWNER`.
  2. **Sidebar & Mobile Navigation:** Memperbarui `Sidebar.tsx` dan `MobileNavDrawer.tsx` agar merender sub-menu berjenjang dengan active indicator yang presisi.
  3. **Role Gating:** Memperbarui `(pos)/layout.tsx` dan `/sales/page.tsx` untuk mengizinkan role `KASIR` dan `OWNER`.
  4. **Riwayat Penjualan (`apps/web/app/(pos)/sales/history`):**
     - Membuat `page.tsx` dan `SalesHistoryClient.tsx` dengan filter cabang (khusus Owner) dan date-range filter.
     - Membuat `SalesHistoryTable.tsx` berbasis `DataTable` lengkap dengan pencarian dan sorting.
     - Menambahkan hook `useSales` di `apps/web/hooks/usePos.ts`.
  5. **Struk & Invoice (`SaleReceiptDialog.tsx` & `SaleSuccessDialog.tsx`):**
     - Menampilkan nama usaha (`NEXT_PUBLIC_BUSINESS_NAME` / fallback) dan nama cabang.
     - Mendukung aksi cetak struk via `window.print()`.
  6. **Testing:** Menambahkan unit test `SalesHistoryTable.test.tsx` dan memperbarui `nav-config.test.ts`.
- **Status:** Done
- **Handoff notes:** Semua unit tests dan linter pass (40 test suites, 257 tests passed). PR diajukan ke branch `dev`.

---

### TASK-026 — Payment Methods (Accounts) Management UI & POS Revamp Preparation

- **Date:** 2026-08-19
- **Module / Phase:** Phase UI Revamp / Payment Methods Management (`(back-office)/accounts`)
- **Objective:** Sediakan UI manajemen Metode Pembayaran / Akun Kas & Bank (`(back-office)/accounts`) untuk role ADMIN dan OWNER guna mendukung fleksibilitas konfigurasi metode pembayaran (Kas Tunai, E-Wallet, QRIS, Bank Transfer) yang dikonsumsi POS dan rekonsiliasi.
- **Relevant docs:** PRD §5.1, ADR-004, ADR-010, ADR-011, DESIGN.md
- **What was done:**
  1. **Frontend UI (`(back-office)/accounts`):** Membuat `page.tsx`, `AccountsClient.tsx`, `AccountsTable.tsx`, dan `AccountFormDialog.tsx` untuk CRUD akun kas/bank (nama, tipe akun `CASH`/`BANK`/`EWALLET`, kas awal / opening balance).
  2. **Frontend Hooks (`apps/web/hooks/useAccounts.ts`):** Mengimplementasikan TanStack Query hooks `useAccounts`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount`.
  3. **Navigasi (`apps/web/lib/nav-config.ts`):** Mendaftarkan route `/accounts` (Metode Pembayaran) untuk role ADMIN dan OWNER. Update unit tests di `nav-config.test.ts`.
  4. **Database Seed (`apps/api/prisma/seed.ts`):** Menambahkan seed akun default untuk QRIS dan E-Wallet serta memperbarui penamaan Transfer Bank.
  5. **DESIGN.md Update:** Memperbarui spesifikasi layout dan komponen POS sesuai referensi Konteks POS 3-Zone layout.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` all green (web: 256 unit tests passed, api: 145 unit tests passed).

---

### TASK-025 — Phase 10a: Profile Self-Service (name, password, delete-own-account)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 10a of the HR-lite feature set (plan: `list-fitur-yang-kurang` / `docs/plannings/phase-10a-profile-self-service.md`) — second of six phases (9–13, with 10 split into 10a/10b) covering employee/branch management, profile self-service, attendance/device tracking, leave requests, and a help page.
- **Objective:** Give every authenticated role (KASIR, ADMIN, OWNER) a self-service profile page to change their own display name, change their password (reusing the existing `PATCH /auth/password` endpoint), and soft-deactivate their own account ("Hapus Akun Saya" in the UI) — with the critical guard that the last active OWNER cannot deactivate themselves (ADR-011 §5: would leave the business with no one who can create/manage staff). `Sale.userId` is an audit trail (ERD §7 note 3) — no hard delete, ever.
- **Relevant docs:** ADR-011 (role/branch rules, self-service scope), ERD §7 note 3 (no hard delete — `Sale.userId` audit trail), System Design v4 §5 (route/role table — neither `(back-office)` nor `(pos)` admits all three roles), Playbook §4 (Zod contracts), Playbook §8 (guards).
- **What was done:**
  1. **API contracts (`packages/api-contracts/src/auth.schema.ts`):** Added `UpdateSelfSchema` (`{ name: string.trim().min(1).max(120) }`) + `UpdateSelf` type — name only, no email (email change stays OWNER-administered via `PATCH /users/:id`). Same low-risk additive shape as Phase 9's `UpdateUserSchema` extension, pre-approved at go/no-go checkpoint.
  2. **Backend DTO (`apps/api/src/modules/auth/auth.dto.ts`):** Added `UpdateSelfDto` re-exporting the contract schema.
  3. **Backend exceptions (`apps/api/src/modules/auth/auth.exceptions.ts` — new file):** Created `LastActiveOwnerException` extending `BadRequestException` with the guard message, following the `users.exceptions.ts` pattern (Playbook §6 — named domain exceptions instead of bare framework exceptions).
  4. **Backend service (`apps/api/src/modules/auth/auth.service.ts`):** Added `updateProfile(userId, dto)` — simple name update; added `deactivateSelf(userId)` — soft-deactivates (`isActive: false`, clears `refreshTokenHash`, bumps `tokenValidFrom`), with `if (user.role === 'OWNER') { if (activeOwnerCount <= 1) throw LastActiveOwnerException() }` guard.
  5. **Backend controller (`apps/api/src/modules/auth/auth.controller.ts`):** Added `PATCH /auth/me` (`updateProfile`), `PATCH /auth/deactivate` (`deactivateSelf` + clears auth cookies).
  6. **Backend e2e test (`apps/api/test/profile-self-service.e2e-spec.ts` — new file):** 6 tests covering KASIR name change, empty-name rejection, unauth rejection; last-active-OWNER rejection, normal OWNER self-deactivation, session termination (old cookie unauthorized after deactivation). **One test-order bug found and fixed during execution:** the `activeOwnerCount` guard counts *all* active OWNERs in the table, so the `soleOwner` fixture was only truly "last" after the other two fixture OWNERs (`ownerA`, `ownerB`) had deactivated themselves in preceding tests — reordered the three deactivate tests to run: session-end → ownerA deactivation → soleOwner last-OWNER rejection (last). `beforeAll`/`afterAll` amendments deactivate/restore pre-existing seeded OWNERs so the test is environment-independent.
  7. **Frontend route group (`apps/web/app/(shared)/layout.tsx` — new file):** New route group admitting all three roles via `requireRole(['KASIR', 'ADMIN', 'OWNER'])` + `AppShell`. Neither existing group (`(back-office)`: ADMIN/OWNER only; `(pos)`: KASIR only) could host a page needed by all roles. Phase 13 (Help page) reuses this same group. Approved at go/no-go checkpoint.
  8. **Frontend hooks (`apps/web/hooks/useProfile.ts` — new file):** `useCurrentUser()`, `useUpdateProfile()`, `useChangePassword()`, `useDeactivateSelf()` — TanStack Query hooks against the new endpoints.
  9. **Frontend profile page (`apps/web/app/(shared)/profile/page.tsx` + `ProfileClient.tsx` + `DeleteMyAccountDialog.tsx` — new files):** Three-section UI: name form (pre-filled, validation via `UpdateSelfSchema`), password form (old + new + confirm, validation via extended `ChangePasswordSchema`), danger zone with "Hapus Akun Saya" button opening a confirm dialog. Dialog copy adapted from `DeactivateConfirmDialog.tsx` (first-person, soft-deactivate semantics). `router.refresh()` on save updates Topbar display name.
  10. **Topbar (`apps/web/components/shell/Topbar.tsx`):** Added `User` icon import; dropdown now shows "Profil Saya" link (href `/profile`) between the email label and Logout, accessible to all three roles.
- **Decisions made during this task:**
  1. **Go/no-go checkpoints re-confirmed before execution** (plan §0.1): (a) additive `UpdateSelfSchema` contract change approved; (b) new `(shared)` route group approved over duplicating `/profile` under both existing groups — structural decision, not just a file addition.
  2. **Prettier reformatting (4 spots, formatting only):** plan's literal code violated repo's prettier config (printWidth 80); applied only the lint-required fixes — `updateProfile` signature collapsed to one line, e2e fixture object/array reformatted. No semantic change.
  3. **E2e test-order bug (plan §6 defect):** plan's test order assumed `soleOwner` was "last active OWNER" among fixtures, but guard counts ALL active OWNER rows in table. Discovered when 2/6 tests failed; fixed by reordering deactivate tests to run in dependency order (ownerB session test → ownerA deactivation → soleOwner rejection last). Added explanatory comment. **Lesson:** even a reviewed plan's literal test order can carry an internal contradiction between what the guard counts and what the test assumes — running the e2e suite is not optional.
- **Status:** Done
- **Handoff notes:** `pnpm --filter @ohmypos/api-contracts build`, `pnpm turbo run lint typecheck --filter=@ohmypos/api-contracts --filter=api --filter=web`, `pnpm --filter api test:e2e -- profile-self-service.e2e-spec.ts` (6/6), `pnpm turbo run test` (api: 145 unit + 6 new e2e, web: 254 unit) — all green. Manually verified in-browser via Playwright skill (step §8): KASIR/ADMIN/OWNER all see "Profil Saya" in Topbar dropdown and reach `/profile`; name change → Topbar refreshes; password change with wrong/right old password both verified; self-deactivation logs out to `/login` and OWNER can see deactivated account at `/users`; last-active-OWNER guard surfaces error in dialog. One thing discovered, not fixed: the plan's "current" content for `auth.schema.ts` omitted the file's existing header comment (`/** Auth request/response shapes (ADR-011 §3)... */`) — cosmetic, no drift.

---

### TASK-024 — Phase 9: User & Branch Management UI (`(back-office)/users`, `(back-office)/branches`)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 9 of the HR-lite feature set (plan: `list-fitur-yang-kurang`) — first of six phases (9–13, with 10 split into 10a/10b) covering employee/branch management, profile self-service, attendance/device tracking, leave requests, and a help page.
- **Objective:** Give OWNER a working UI to create/edit/deactivate/reactivate staff, assign/reassign a KASIR's branch, and CRUD branches — closing the gap where `UsersService`/`BranchesController` were fully built but `/users` was a stub and `/branches` had no frontend at all.
- **Relevant docs:** ADR-011 (role/branch rules), ERD §7 note 3 (no hard delete — `Sale.userId` is an audit trail), System Design §5 (route/role table), Playbook §4 (Zod contracts), Playbook §8 (guards).
- **What was done:** Extended `UpdateUserSchema` (`packages/api-contracts/src/user.schema.ts`) with optional `role`/`branchId` — approved separately as an API-contract change before implementation. Fixed `branchRule`'s generic signature (`user.schema.ts`) so `zodResolver` type-infers correctly against the refined schema; this was a latent typing bug in the pre-existing helper that had never been exercised because no form had used `CreateUserSchema` before. `UsersService.update()` now re-validates `assertRoleBranchConsistent` against the **merged** role/branchId (existing + patch), not just the fields sent, and checks the target branch exists. Frontend: `UsersClient.tsx`/`UsersTable.tsx`/`CreateUserDialog.tsx`/`EditUserDialog.tsx`/`DeactivateConfirmDialog.tsx` and the equivalent `BranchesClient.tsx`/`BranchesTable.tsx`/`BranchFormDialog.tsx`/`DeleteConfirmDialog.tsx`, following the Phase 8e–8i server-component/client-component/TanStack-Query-hook pattern exactly (`hooks/useUsers.ts`, `hooks/useBranches.ts`). `/branches` added to `lib/nav-config.ts`'s OWNER array. New e2e suite `apps/api/test/user-branch-management.e2e-spec.ts` (8 tests) covering the merge-validation edge cases the schema layer can't catch on its own (promote without clearing branch, demote without assigning one, reassign between branches, unknown branch 404).
- **Decisions made during this task:** (1) "Hapus" in the UI calls `PATCH /users/:id/deactivate` under the hood, per user's explicit choice when this was scoped — no hard delete exists or was added (ERD §7 note 3 stands). (2) Create/edit user dialogs are two separate components rather than one dual-schema dialog, because `CreateUserSchema` requires `password` and `UpdateUserSchema` doesn't — forcing one shared Zod resolver would have meant a weaker type than either schema actually has. (3) Added `autoComplete="off"`/`"new-password"` to the create-user form fields after live browser testing showed Chrome's password manager autofilling the logged-in OWNER's own saved name/password into the new-user form — a real UX/security footgun for a form whose entire purpose is minting a *different* person's credential, not a hypothetical.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` green (web: 254 unit tests incl. updated `nav-config.test.ts`; api: 203 e2e tests incl. the new 8; both packages lint/typecheck clean). Manually smoke-tested in a real browser end-to-end: create → edit (assign branch) → deactivate → reactivate, all verified against the running dev stack, not just automated tests. **One thing discovered, not fixed, worth flagging:** the local dev seed (`prisma/seed.ts`) writes KASIR rows via `prisma.user.createMany` directly, bypassing `UsersService` — two seeded KASIR accounts (`kasir@ohmypos.local`, `qa.kasir@ohmypos.local`) had `branchId: null` in the dev DB, which violates the invariant `UsersService`/`assertRoleBranchConsistent` enforces everywhere else. Logged as DEBT-023. Not a Phase 9 regression — Phase 9's new Edit UI is in fact the first tool that can fix it, and was used to fix one of the two live during testing. **What Phase 10a needs to know:** the `EditUserDialog` pattern (role-conditional branch select, merge-aware validation) is the template for any future self-service profile form; `PATCH /auth/password` already exists server-side, only the UI is missing.

---

### TASK-023 — Phase 8i: Dashboard Overview screen (`GET /reports/cash-balance` + `(back-office)/dashboard`)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8i — new `GET /reports/cash-balance` endpoint (Dashboard 3) and the OWNER-only `(back-office)/dashboard` overview screen (Dashboard 1).
- **Objective:** Give OWNER a single landing screen summarizing cash, this month's P&L, supplier debt, and low-stock — combining a new running-cash-balance report with three already-existing endpoints (`profit-loss`, `daily-income`, `/payables/summary`, `/inventory/summary`). Executed from `docs/plannings/phase-8i-dashboard-overview.md` (an approved, fully-literal implementation plan that was itself reviewed and amended for four verified defects before execution — see below).
- **Relevant docs:** PRD §5.4; ADR-004 (Kas Awal), ADR-008 (query-time reports), ADR-017 (P&L composition), ADR-018 (WIB report period); System Design v4 §5/§6.6; AGENTS.md glossary (Kas Awal, Admin/Owner route scope).
- **What was done:**
  1. **`apps/api/src/common/period.ts`:** added `todayWib(now: Date): string` (WIB calendar day for an instant — stays pure, no internal `Date.now()`) and exported `WIB_OFFSET_MS`. Unit tests added to `period.spec.ts` (same-day, roll-over, early-UTC cases).
  2. **`packages/api-contracts/src/report.schema.ts`:** added `CashBalanceQuerySchema` (`asOfDate` optional), `CashBalanceAccountRowSchema`, `CashBalanceResponseSchema` (`{ asOfDate, timezone, totalBalance, accounts[] }`).
  3. **Backend — `reports.dto.ts`/`.controller.ts`/`.mapper.ts`/`.service.ts`:** new `GET /reports/cash-balance` (`@Roles('OWNER')`, no `BranchScopeGuard` — deliberate, same reasoning as the other five report endpoints). `ReportsService.cashBalance` is a raw-SQL running balance — `Account.openingBalance` + Σ(INFLOW) − Σ(OUTFLOW) strictly before `asOfDate`'s WIB-midnight cutoff — deliberately **not** built on the shared `ledgerScope` helper (unbounded lower edge, no branch filter). Added 7 e2e cases (34–40: zero-activity account, inflow/outflow sum, asOfDate exclusivity boundary, default-to-today, schema conformance, RBAC).
  4. **Frontend hooks — `apps/web/hooks/useReports.ts`:** added `useCashBalance(asOfDate?)` to the **existing** Phase 8g file (see "Decisions" below) — did not touch `useProfitLoss`/`useDailyIncome`'s existing `(filters, enabled)` signature.
  5. **New route/components:** `app/(back-office)/dashboard/page.tsx` (OWNER-only, `requireRole(['OWNER'])`), `components/dashboard/DashboardKpiCards.tsx` (4 KPI cards: Kas, Laba Bersih Bulan Ini, Utang Supplier, Stok Rendah), `components/dashboard/DashboardClient.tsx` (KPI row + daily-income trend chart, reusing the existing `ReportLineChart`/`ChartEmptyState` from `components/reports/ReportChart.tsx` — no new chart component, no new dependency), plus `DashboardKpiCards.test.tsx`.
  6. **Nav + landing redirect:** `lib/nav-config.ts` — `/dashboard` added as OWNER's first nav item (ADMIN/KASIR unchanged). `app/page.tsx` — root now routes OWNER → `/dashboard`, KASIR → `/sales`, ADMIN → `/master-data` (previously ADMIN and OWNER both landed on `/master-data`).
- **Decisions made during this task:**
  1. **Pre-execution plan review caught 4 verified defects, fixed in the plan doc before any code was written:** (a) the plan's own §0 pre-check asserted `InventorySummaryResponse`'s array field was `.rows`; the live schema (`inventory-summary.schema.ts`) has `.data` — three usage sites corrected. (b) the plan assumed `recharts` needed installing behind a governance checkpoint; it was already a dependency since commit `fc80502` (Phase 8g) — the install step was replaced with a verify-only `grep`. (c) the plan's §4 spec'd a new bespoke `DailyIncomeChart.tsx` reimplementing axis/tooltip/theme logic that `ReportLineChart` already provides — removed, §3.4 rewired to reuse it. (d) the e2e `cleanup()` helper only deleted `Account` rows prefixed `'RP '`; the new `'CB '`-prefixed fixture accounts would have leaked across test runs — added the missing delete.
  2. **A fifth defect surfaced only during execution, not the review pass:** the plan's §1.7 literally specified `const cutoff = resolveReportRange(asOfDate, asOfDate).to` for the cash-balance cutoff. `.to` is the *exclusive upper bound the day after* `asOfDate` (per `period.ts`'s own contract), which would have counted entries dated *on* `asOfDate` as already-elapsed — contradicting both the response schema's own doc comment ("strictly before asOfDate's exclusive upper bound") and e2e Case 36's explicit assertion that same-day entries are excluded. Running the e2e suite caught this immediately (Case 36 failed with the wrong balance); fixed to `.from`. Lesson: even a reviewed, amended plan's literal code can carry an internal contradiction between what one section's SQL does and another section's test expects — running the tests it specifies is not optional, even for "already-verified" plan sections.
  3. **`useReports.ts`/`useReports.test.ts` were not new files, contrary to the plan's premise.** They already existed (Phase 8g, commit `fc80502`) with `useProfitLoss(filters: ReportFilters, enabled)` / `useDailyIncome(filters, enabled)` consumed by `ReportsClient.tsx` and `TopProductsView.tsx`. Overwriting them with the plan's assumed two-string-argument signature would have broken those live consumers. Resolution: added `useCashBalance` alongside the existing hooks without changing their signature, and adapted `DashboardClient.tsx` to call `useProfitLoss({ startDate, endDate })`/`useDailyIncome({ startDate, endDate })` (the real signature) instead of the plan's `useProfitLoss(startDate, endDate)`. No other file in this repo assumes the plan's hook signature, so this was a zero-blast-radius adaptation.
- **Status:** Done
- **Handoff notes:** `pnpm --filter api test` (145/145), `pnpm --filter api test:e2e -- reports.e2e-spec` (57/57, including the 7 new cash-balance cases), `pnpm --filter web test` (254/254 across 38 files), and `pnpm turbo run lint typecheck` all green across all 5 packages. Manually verified in-browser (not just automated tests) via `claude-in-chrome`: OWNER login renders the dashboard with real seeded data (KPI cards, chart, "Perlu Perhatian" panel with a working link to `/expenses`); ADMIN and KASIR direct-navigating to `/dashboard` are both server-side redirected away (`requireRole` guard) rather than seeing even a flash of the page. Two things worth knowing for whoever next touches `useReports.ts`: (1) it now serves two different call conventions historically — `ReportFilters`-object hooks (profit-loss, product-profit, income-by-payment-method, top-products, daily-income) and one optional-single-arg hook (`useCashBalance`) — this asymmetry is intentional (cash-balance has no date range, just a single `asOfDate`), not an inconsistency to "fix"; (2) `CashBalanceQuerySchema`'s `asOfDate` is a WIB calendar-day cutoff, and the endpoint has **no `BranchScopeGuard`/branch filter by design** — `Account.openingBalance` carries no branch (ERD §3), so branch-scoping only the ledger side while leaving opening balance unscoped would silently misstate the total; do not add a `branchId` query param to this endpoint without revisiting that reasoning first.

### TASK-022 — Phase 8j: Frontend Reconciliation Screen (`(back-office)/reconciliation`)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8j — `apps/web` Reconciliation back-office screen
- **Objective:** Build the ADMIN/OWNER-only reconciliation UI per PRD §5.7 — bank statement CSV import, auto-match review queue, manual split allocation, and a filterable bank-transaction table with a summary strip — against the reconciliation backend that has been live since Phase 1–2 (`apps/api/src/modules/{import,matching,allocation,reconciliation}`). Executed from `docs/plannings/phase-8h-reconciliation.md` (an approved, fully-literal implementation plan).
- **Relevant docs:** PRD §5.7; System Design v4 §6.5; ADR-004, ADR-008, ADR-010, ADR-011, ADR-012; ADR-019 (new — see below); ERD v3 §2/§6 (`BankTransaction`, `Allocation`); DESIGN.md §34/§35 (split-allocation dialog).
- **What was done:**
  1. **`lib/api.ts`:** `doFetch` now omits the JSON `Content-Type` header for a `FormData` body so the browser can set the multipart boundary itself — the only caller is the CSV import. JSON callers are unaffected (+2 tests in `api.test.ts`).
  2. **`lib/reconciliation/allocation-draft.ts` + test:** pure arithmetic for the split-allocation running total (`summariseDraft`), copying the backend's allocation-sum invariant verbatim — strict `>` boundary, ACTIVE-only committed sum, per-line validation states, and a `toCreateAllocationPayload` builder. All money arithmetic goes through `lib/decimal.ts`'s BigInt `Fixed`, never `Number`.
  3. **`lib/reconciliation/match-candidates.ts` + test:** turns a `MatchCandidate` (which carries a plural `bankTransactionIds` and one aggregate `matchedAmount`, not per-transaction amounts) into a `CreateAllocation` batch by looking up each transaction's own amount and cross-checking the sum against the engine's total before submitting.
  4. **`hooks/useReconciliation.ts`:** one `useQuery`/`useMutation` per endpoint (summary, transactions, pending-review, transaction-allocations, ledger-entry candidates; import, propose, reset, reject, create-allocations, revoke-allocation), following the established Phase 8a pattern. `useProposeMatches` is deliberately a mutation, never a query, because `POST /matching/propose` writes (`UNRESOLVED → PENDING_REVIEW`).
  5. **`components/reconciliation/`:** `BankStatementImportCard.tsx` (CSV upload, BCA/MANDIRI format select, 5 MB client-side size guard), `MatchReviewQueue.tsx` (propose-on-click, accept-builds-a-batch, per-candidate reject — see decisions below, confirm-gated bulk reset), `ReconciliationSummaryCards.tsx` (status counts + bank/ledger/variance from `GET /reconciliation/summary`, server-computed per ADR-008), `SplitAllocationDialog.tsx` (the centerpiece — server-confirmed committed base + client-projected draft rows, submit disabled while over-allocated), `BankTransactionsTable.tsx` (shared `DataTable`).
  6. Wired `app/(back-office)/reconciliation/page.tsx` to render a new `ReconciliationClient.tsx` (filters, summary, import card, match queue, transaction table + pagination, split dialog), replacing the Phase-1 placeholder sentence. `requireRole(['ADMIN','OWNER'])` guard untouched; a 403 reaching the client (session role changed after render) collapses the whole body to one Alert rather than four separate widget errors.
  7. Test suites: `allocation-draft.test.ts`, `match-candidates.test.ts`, `SplitAllocationDialog.test.tsx`, `MatchReviewQueue.test.tsx`, `BankStatementImportCard.test.tsx`, `ReconciliationClient.test.tsx`, plus the 2 new `api.test.ts` cases.
- **Decisions made during this task:**
  1. **Split-allocation running-total feedback (plan §2.1, "Decision 1"):** server-confirmed committed base (`GET /allocations/transaction/:id`, ACTIVE rows only) + local draft state, combined by one pure function (`summariseDraft`), over an optimistic-cache approach or submit-each-line-immediately — chosen so an abandoned split costs nothing and the `==` boundary (exact allocation is the success case, not an error) stays expressible.
  2. **Split UI location (plan §2.2):** a modal `Dialog` opened from a transaction row, matching every other write surface in this codebase (`PayableSettlementDialog`, `ProductFormDialog`), over a permanent third pane or a `Sheet`.
  3. **Ledger-entry candidate picker (plan §2.3, superseded mid-plan):** the plan's original design (unbounded `limit=100` fetch, client-side date-proximity sort only) was superseded before implementation — see "Backend expansion" below. The picker now filters server-side by an inclusive ±30-day window around the anchor transaction's date (`LEDGER_CANDIDATE_WINDOW_DAYS` in `useReconciliation.ts`), deliberately wider than the matching engine's 3-day auto-match tolerance, with the client-side nearest-date-first sort retained as a secondary refinement within that narrower window.
  4. **"Abaikan" (reject) semantics (plan §2.4, superseded mid-plan):** the plan's original "client-side dismissal only, writes nothing" design was superseded before implementation — see "Backend expansion" below. "Abaikan" now calls the real per-candidate reject endpoint once per `bankTransactionId` in the candidate (an AGGREGATION candidate can span several) and only removes the candidate from the queue once every call succeeds; a partial failure leaves the candidate visible with an error rather than silently dropping a transaction that is still `PENDING_REVIEW`.
  5. **403 handling (plan §2.5):** one page-level guard — if any reconciliation query fails with `ApiError.status === 403`, the whole screen body collapses to a single Alert, rather than four separate per-widget error states.
  6. **Backend expansion (done by the orchestrating session, not deferred as tech debt):** two backend gaps the plan's DRAFT had flagged as out-of-scope tech debt were actually closed before this task's implementation began: `POST /matching/reject/:bankTransactionId` (guarded ADMIN/OWNER, 404 if the transaction doesn't exist, 409 if it isn't `PENDING_REVIEW`) was added to `matching.controller.ts`/`matching.service.ts`; and `LedgerEntryQuerySchema` gained optional `startDate`/`endDate` (inclusive `entryDate` bounds), wired through `LedgerEntriesService.findAll`'s `where`. The frontend was built against these endpoints directly rather than against the plan's original workarounds. The "one `LedgerEntry` may legally be allocated by more than one `BankTransaction`" gap (plan §1.6/§2's tech debt #2) was likewise not logged as debt — it is recorded as an accepted v1 risk in **ADR-019**, and the `SplitAllocationDialog`'s advisory-only "•" marker on already-allocated entries (never blocking, per ADR-019) was built exactly as the plan specified.
- **Status:** Done
- **Handoff notes:** `pnpm --filter web test`, `pnpm turbo run lint typecheck test --filter=web`, and `pnpm --filter web build` all green. Not touched: `apps/api/**`, `packages/api-contracts/**`, `packages/ui/**` (all already correctly updated for the backend expansion ahead of this task). Three non-obvious backend behaviours the screen is built around, worth knowing before touching this screen again: (1) `POST /matching/propose` **writes** — it flips every matched transaction `UNRESOLVED → PENDING_REVIEW`, so it is a mutation behind an explicit button, never a `useQuery`; (2) proposed candidates are **not persisted** — they exist only in that one HTTP response, so reloading the page empties the queue and re-running propose will not re-surface transactions it already moved to `PENDING_REVIEW` (the only way back is Reset or the new per-candidate reject); (3) `BankTransaction.status` is **entirely trigger-derived** (`sync_transaction_status`) — the UI never computes or predicts it, always refetches after a write. Remaining tech debt: `AllocationWithLedgerEntry` (the `Allocation`-with-`ledgerEntry` composed response type in `useReconciliation.ts`) still has no dedicated Zod schema — logged as DEBT-022.

### TASK-021 — Phase 8g: Frontend Reports Screen (`(back-office)/reports`, Dashboard 3)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8g — `apps/web` Reports back-office screen
- **Objective:** Build the OWNER-only Dashboard 3 reports UI per PRD §5.4 — P&L, sales-per-product profit, income by payment method, top 10 products, and daily income, all filterable by date range and branch, with charts — against the five `GET /reports/*` endpoints Phase 7 already shipped (`apps/api/src/modules/reports/*`). Pure frontend-rendering work; no backend/contract change.
- **Relevant docs:** PRD §5.4; `docs/plannings/phase-7-reporting.md` (exact API shapes, ADR-017 P&L composition, ADR-018 WIB report boundaries); DESIGN.md §36/§37 (Reports density, Flow Indicator) and §51 (approved mockup, reference-not-spec); AGENTS.md governance (new-dependency approval gate).
- **What was done:**
  1. **New dependency (approved):** added `recharts@^3.10.1` to `apps/web` — no charting library existed in `packages/ui` or `apps/web` beforehand; verified React 19 peer-dep compatibility before installing.
  2. **`hooks/useReports.ts`:** 5 TanStack Query hooks (`useProfitLoss`, `useProductProfit`, `useIncomeByPaymentMethod`, `useTopProducts`, `useDailyIncome`), each building its query string from a shared `{startDate, endDate, branchId?}` filter shape (+ `rankBy`/`limit` for top-products), `enabled`-gated per active tab so switching tabs doesn't fire five requests at once. Test suite `useReports.test.ts`.
  3. **`components/reports/`:** `ReportFilterBar.tsx` (shared date-range + branch `Select`, URL-synced, `Semua Cabang` sentinel for the omitted-branchId case); `ReportChart.tsx` (shared Recharts bar/line wrappers themed off `packages/ui`'s CSS-variable design tokens, one custom tooltip, one `ChartEmptyState`); `ProfitLossView.tsx`, `ProductProfitView.tsx`, `IncomeByPaymentMethodView.tsx`, `TopProductsView.tsx`, `DailyIncomeView.tsx` (one per report, each pairing a chart with the shared `DataTable`); `ReportsClient.tsx` composing the filter bar + a `Tabs` shell (Phase 8f pattern) + the five views, URL-synced (`startDate`, `endDate`, `branchId`, `tab`).
  4. **Shared helpers:** `formatPercent` (`lib/formatters.ts`) for the already-computed `marginPct`/`sharePct`/`netMarginPct` fields; `getFlowIndicatorClassesForAmount` (`lib/vocabulary.ts`) — a sign-based sibling to the existing direction-based `getFlowIndicatorClasses`, for report figures that are legitimately negative (grossProfit/netProfit/netCashFlow, ADR-017 §2) rather than INFLOW/OUTFLOW literals.
  5. Wired `app/(back-office)/reports/page.tsx` to render `<ReportsClient />` in a `Suspense` boundary, replacing the Phase-3 placeholder; `requireRole(['OWNER'])` guard untouched.
  6. Test suites: `ReportFilterBar.test.tsx`, `ProfitLossView.test.tsx`, `ProductProfitView.test.tsx`, `IncomeByPaymentMethodView.test.tsx`, `DailyIncomeView.test.tsx`, `TopProductsView.test.tsx`, plus additions to `formatters.test.ts` and `vocabulary.test.ts` — filter/formatting correctness and representative + empty-payload rendering, not chart pixel output, per the reviewer's steer.
- **Decisions made during this task:**
  (1) Chart library: Recharts over hand-rolled SVG or visx — user's explicit choice among the 3 options presented (AGENTS.md's ≥3-option requirement), approved as a new dependency.
  (2) Screen structure: one page with a `Tabs` shell and one shared filter bar (matches Phase 8f precedent) over separate sub-routes per report or an all-stacked no-tabs page — only the active tab's query is `enabled`.
  (3) `TopProductsView` is the one view that calls its own `useTopProducts` hook internally (owns local `rankBy`/`limit` UI state) instead of receiving `data`/`isLoading` as props like the other four — `rankBy` is specific to that one report, not part of the shared filter bar.
  (4) P&L has no per-day series in its API response (single aggregate for the range) — its chart is a composition bar (income/COGS/opEx/net), not a trend line; the literal PRD "trend line" chart belongs to Daily Income, the one report with a real per-day series. No client-side recomputation was introduced to fake a P&L trend.
  (5) Explicitly out of scope, flagged rather than silently built: the mockup's XLSX export / "Bagikan laporan" buttons (no backend endpoint, not in PRD §5.4) and its per-branch side-by-side comparison table (PRD asks for filter *by* branch, not a simultaneous multi-branch matrix) — DESIGN.md §51/§52, mockup is reference not spec.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green; 205 frontend tests pass (`apps/web`). Manually verified against the running dev stack (Chrome browser automation, Playwright MCP unavailable this session): all 5 tabs render real data from the live API with correct Flow Indicator sign-coloring, the branch filter and `rankBy` control both trigger correctly-parameterized requests (confirmed via network inspection), and ADMIN is still redirected away from `/reports` (guard untouched, re-verified live). **One real bug found and fixed during that manual pass:** the default date-range helper in `ReportsClient.tsx` built `YYYY-MM-DD` via `date.toISOString().slice(0, 10)`, which reads UTC and silently shifts the "1st of the month" default backward by a day in any positive-UTC-offset timezone — including WIB (UTC+7), this app's actual target timezone (ADR-018). Fixed to build the date string from local `getFullYear()`/`getMonth()`/`getDate()` components instead, the same pattern `DatePicker` (`packages/ui`) already used correctly. Worth grepping for `toISOString().slice(0, 10)` elsewhere in `apps/web` if a similar default-date helper gets added later — this is an easy mistake to reintroduce.

### TASK-020 — Phase 8e: Frontend Opening Stock Screen (`(back-office)/inventory`)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8e — `apps/web` Opening Stock back-office screen
- **Objective:** Build the OWNER-only monthly opening stock worksheet entry screen per PRD §5.5, Phase 6 plan, and DESIGN.md: month-based period navigation with URL sync, bulk worksheet table displaying raw material carry-forward balances, quantity input pre-fills, and conditional unit price entry (rendered as active CurrencyInput when `requiresUnitPrice: true`, or locked badge when purchase already priced the material in that period).
- **Relevant docs:** PRD §5.5; System Design §5, §6.4; ADR-004, ADR-010, ADR-011, ADR-016, ADR-018; Playbook §4, §5, §8, §10; DESIGN.md §6/§32; Phase 6 plan `phase-6-inventory.md`.
- **What was done:**
  1. **Data Hooks (`apps/web/hooks/useInventory.ts`):**
     - Created `useOpeningStockWorksheet(period)` calling `GET /inventory/opening-stock?period=YYYY-MM`.
     - Created `useUpsertOpeningStock()` calling `PUT /inventory/opening-stock` and invalidating the active period worksheet query cache on success.
     - Added test suite `hooks/useInventory.test.ts` covering both query and mutation workflows.
  2. **Components (`apps/web/components/` & `@ohmypos/ui`):**
     - Created Radix/shadcn UI primitive `packages/ui/src/components/ui/select.tsx` (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`).
       - Added curated shadcn/Radix components to `@ohmypos/ui`: `alert.tsx`, `popover.tsx`, `tooltip.tsx`, `separator.tsx`, `skeleton.tsx`, `scroll-area.tsx`, `sheet.tsx`, `calendar.tsx`, `date-picker.tsx` with DESIGN.md tokens.
       - Refactored `MobileNavDrawer.tsx` from hand-rolled overlay div to shadcn `Sheet` (Radix Dialog) primitive with side="left" mobile drawer behavior.
      - `PeriodNavigator.tsx` now opens a month-grid popover instead of a date calendar — only month names rendered (no dates/days), with year prev/next header; clicking a month sets the period to `YYYY-MM` of the viewed year; prev/next month buttons retained.
      - Replaced all native `<input type="date">` with the shadcn `DatePicker` (Popover + Calendar) in `GeneralExpenseFormDialog.tsx` (entryDate), `PurchaseEntryFormDialog.tsx` (purchaseDate), and `PayableSettlementDialog.tsx` (settledAt).
      - Bumped vitest `testTimeout` to 15000ms in `apps/web/vitest.config.mts` — 5s default flaked under turbo's parallel CPU load with Radix popover/portal-heavy jsdom tests.
      - Fixed calendar popover jumpiness: `calendar.tsx` now renders a fixed 6-week grid (49 cells, trailing empty cells + uniform `h-8 w-8` cells) so the calendar height never varies between months and the Popover content stays anchored in place. `DatePicker` popover forced `side="top"` + `avoidCollisions={false}`.
      - 320px mobile support: calendar container changed from fixed `w-65` to `w-fit`, `PopoverContent` gained default `collisionPadding={8}`. Verified via Playwright at 320×700 — inventory, expenses, master-data (incl. Sheet drawer 272px), reports, reconciliation all show zero horizontal overflow; month-grid popover (22–312px) and calendar popover (42–284px) stay fully in viewport.
     - Refactored all screens and dialogs away from `NativeSelect` to full Radix `Select` primitive across the entire web app: `PeriodNavigator.tsx`, `RecipeEditorDialog.tsx`, `GeneralExpenseFormDialog.tsx`, `PurchaseEntryFormDialog.tsx`, and `PayableSettlementDialog.tsx`.
     - `OpeningStockWorksheetTable.tsx`: Bulk tabular form using React Hook Form + `zodResolver(UpsertOpeningStockSchema)` + `useFieldArray`. Renders material metadata, carry-forward balance, declared quantity input with decimal validation, conditional `CurrencyInput` for unit price or "Otomatis (Pembelian)" locked badge, and complete/partial declaration status badge.
     - `InventoryClient.tsx`: Client coordinator handling URL `?period=YYYY-MM` parameter synchronization, loading/error states, submission handling, and success/error alert banners.
  3. **Page Route (`apps/web/app/(back-office)/inventory/page.tsx`):**
     - Server Component with `requireRole(['OWNER'])` wrapping `InventoryClient` in React `Suspense`.
  4. **Verification & Tests:**
     - Component unit tests: `OpeningStockWorksheetTable.test.tsx` (5 tests passing).
     - Hook unit tests: `hooks/useInventory.test.ts` (2 tests passing).
     - Full monorepo verification: `pnpm turbo run lint typecheck test build` 100% green (15/15 tasks passing).
- **Decisions made during this task:**
  1. Approved Option 1 (React Hook Form with `useFieldArray` + `zodResolver(UpsertOpeningStockSchema)`), Option 1 (URL Query Parameter sync `?period=YYYY-MM`), and Option 1 (Smart pre-fill with locked purchase price badge).
  2. `requiresUnitPrice` respected strictly from backend without client-side recomputation.
- **Status:** Done
- **Handoff notes:**
  - `(back-office)/inventory` opening stock screen is operational and verified.
  - Next phase: Phase 8f (Frontend Inventory Summary).

### TASK-019 — Frontend Responsive Design (Mobile, Tablet, & Desktop Support)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web` and `@ohmypos/ui`) Responsive Design Refactoring
- **Objective:** Implement complete mobile, tablet, and desktop responsive UX across OhMyPos: collapsible slide-over mobile drawer navigation with backdrop blur, responsive topbar with hamburger toggle, responsive 1/2/4-col KPI summary cards, horizontally scrollable tabs and tables, floating sticky bottom cart bar for mobile POS cashiering, and constrained responsive modal dialogs.
- **Relevant docs:** PRD §5; DESIGN.md; Engineering Playbook §5, §10; implementation plan `implementation_plan.md`.
- **What was done:**
  1. **Core UI Primitives (`packages/ui/src/components/ui/dialog.tsx`):**
     - Updated `DialogContent` with `w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto` to prevent viewport clipping and allow smooth vertical scrolling on small mobile screens.
  2. **Shell Layout & Navigation (`apps/web/components/shell/`):**
     - Created `MobileNavDrawer.tsx`: slide-over mobile drawer with ESC-key dismiss, body scroll locking, brand logo, user badge, navigation items, and logout action.
     - Updated `Sidebar.tsx`: hidden on `< md:` screens (`hidden md:flex`) and persistent on desktop.
     - Updated `Topbar.tsx`: hamburger trigger button on mobile (`md:hidden`), mobile logo header, and truncated user profile badge.
     - Updated `AppShell.tsx`: state management for mobile drawer and responsive content padding (`p-3.5 sm:p-6 overflow-x-hidden`).
  3. **POS Screen (`apps/web/components/pos/`):**
     - Added floating sticky bottom cart bar on mobile viewports (`lg:hidden`) displaying item count, total price in IDR, and smooth scroll button to cart panel.
     - Maintained desktop 2-column split view (`ProductGrid` on left, `CartPanel` on right) on `lg:` viewports.
  4. **Back-Office Screens & Dialogs (`apps/web/app/(back-office)/`):**
     - `MasterDataSummaryCards.tsx` & `PayablesTab.tsx`: Responsive grid cards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
     - `MasterDataClient.tsx` & `ExpensesClient.tsx`: Responsive segmented tabs with compact touch styling.
     - `PurchaseEntryFormDialog.tsx`: Responsive input grids (`grid-cols-1 sm:grid-cols-2` and `grid-cols-12`).
  5. **Verification:**
     - Vitest suite: 21 test files, 160 tests passing (100%).
     - Monorepo validation (`turbo run lint typecheck build test`): 15/15 tasks passing clean.
     - Playwright MCP responsive testing across Mobile portrait (375x667), Tablet (768x1024), and Desktop (1280x800).
- **Status:** Done
- **Handoff notes:** Frontend is fully responsive across mobile, tablet, and desktop screens. Ready for remaining feature phases.

### TASK-018 — Phase 8d: Frontend Purchases & Expenses Screens (`(back-office)/expenses`)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8d — `apps/web` Purchases & Expenses back-office screens
- **Objective:** Build the OWNER-only Purchases & Expenses back-office screen per PRD §5.3 and DESIGN.md: categorized general operational expense entry, raw material purchase recording with immediate-paid vs. unpaid (utang) branching (ADR-006), on-the-fly quick supplier creation, payables list with per-supplier running balance summaries, cross-tab unpaid purchase banner, and partial/full payable settlement with live remaining balance calculation and client-side over-settlement prevention.
- **Relevant docs:** PRD §5.3; System Design §5; ADR-006, ADR-010, ADR-011; Playbook §4, §5, §8, §10; DESIGN.md; DEBT-021; ERR-005.
- **What was done:**
  1. **Page shell & tabs (`apps/web/app/(back-office)/expenses/`):**
     - `page.tsx` enforcing `requireRole(['OWNER'])`.
     - `ExpensesClient.tsx` rendering 3 tabs: "Pengeluaran Umum", "Pembelian", and "Utang".
  2. **Components (`apps/web/components/expenses/`):**
     - `GeneralExpenseTab.tsx` + `GeneralExpenseFormDialog.tsx`: Lists OUTFLOW ledger entries, creates categorized expenses tied to branch and account.
     - `PurchaseEntryTab.tsx` + `PurchaseEntryFormDialog.tsx`: Multi-item purchase entry form with running total calculation, paid/unpaid toggle (hides account picker when UNPAID, shows when PAID per ADR-006), duplicate raw-material validation, and cross-tab banner on unpaid creation.
     - `SupplierQuickCreateDialog.tsx`: Modal to register new suppliers on-the-fly without leaving purchase entry.
     - `PayablesTab.tsx` + `PayableSettlementDialog.tsx`: Supplier running balance cards, payables table with status badges (`Belum Lunas`, `Sebagian`, `Lunas`), and modal for partial/full settlement with live "Sisa Setelah Bayar" calculation and client-side overage block (`lib/decimal.ts`).
     - `CentralBranchTag.tsx`: Badge indicator for central vs branch purchases.
  3. **Data Hooks (`apps/web/hooks/useExpenses.ts`):**
     - Reference data hooks: `useCategories`, `useAccounts`, `useBranches`.
     - Ledger hooks: `useLedgerEntries`, `useCreateLedgerEntry`.
     - Supplier hooks: `useSuppliers`, `useCreateSupplier`.
     - Purchase hooks: `useSupplierPurchases`, `useCreateSupplierPurchase`.
     - Payable hooks: `usePayables`, `usePayablesSummary`, `useSettlePayable`.
  4. **Tests & Monorepo Validation:**
     - 6 unit test suites covering expenses: `GeneralExpenseFormDialog.test.tsx`, `PurchaseEntryFormDialog.test.tsx`, `SupplierQuickCreateDialog.test.tsx`, `PayableSettlementDialog.test.tsx`, `PayablesTab.test.tsx`, and `hooks/useExpenses.test.ts`. Total: 21 test files, 160 tests in web, all passing.
     - Full monorepo validation `turbo run lint typecheck test build` 100% clean (15/15 tasks).
     - Live MCP Playwright E2E smoke pass through the full golden path: General expense entry → Unpaid raw material purchase → Cross-tab banner redirection → Partial payable settlement → Automatic OUTFLOW ledger entry creation.
  5. **Tech Debt & Error Logs:** Logged `DEBT-021` (deferred supplier master data edit/delete UI) in `08 - Tech_Debt_Log.md` and `ERR-005` in `06 - Error_Log.md`.
- **Decisions made during this task:**
  1. Fixed-point decimal arithmetic (`lib/decimal.ts`) was used for settlement balance subtraction and purchase totals to avoid floating-point inaccuracies, matching Playbook §5.
  2. Supplier edit/delete master data table deferred to post-v1 backlog (`DEBT-021`); quick-create modal satisfies the purchase entry operational flow cleanly.
- **Status:** Done
- **Handoff notes:** All Phase 8d deliverables, unit tests, monorepo checks, and Playwright E2E smoke tests are complete and verified. Ready for the next phase.

### TASK-017 — Phase 8c: Frontend POS / Sales Screen (`(pos)/sales`)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8c — `apps/web` POS screen, plus three additive backend enablers
- **Objective:** Build the KASIR-only POS screen per PRD §5.2 and DESIGN.md §20–§27: product search + grid, multi-line cart with per-line price override, advisory cart-aware makeable quantity, payment-method selection tied to `Account`, and a submit path that treats `InsufficientStockException` as an in-cart error rather than a toast.
- **Relevant docs:** PRD §5.2; System Design §5, §6.1, §9; DESIGN.md §20–§27, §33, §37; ADR-004, ADR-005, ADR-007, ADR-011, ADR-013, ADR-015, ADR-016; Playbook §5, §6, §8, §10; DEBT-004, DEBT-005, DEBT-009, DEBT-010.
- **What was done:**
  1. **Backend enablers (all approved before implementation; no schema change, no migration):**
     - `GET /accounts/payment-methods` — new KASIR-readable route (`accounts.controller.ts`, declared above `@Get(':id')`), backed by `AccountsService.findPaymentMethods()` which uses a Prisma `select` so `openingBalance` (Kas Awal) never reaches a cashier. New `PaymentMethodResponseSchema`. The rest of `/accounts` stays `OWNER`/`ADMIN`.
     - `ProductWithHppResponse.recipeItems` — the recipe fan-out (`rawMaterialId`, 4dp `quantityUsed`) added to `products.mapper.ts` from the `recipeItems` relation already eagerly included for the HPP calculation. No query change, no N+1.
     - `InsufficientStockException` now carries a machine-readable body: `code: 'INSUFFICIENT_STOCK'` plus `details.shortfalls[{rawMaterialId, name, required, available}]`. Built with an object descriptor so the global filter passes it through verbatim; `message` is byte-identical to the previous string form, so existing assertions still hold. `stock.rules.ts` passes `rawMaterialId` through (it already had it). Wire contract: `InsufficientStockErrorSchema` in `sale.schema.ts`.
  2. **Pure frontend modules** (`apps/web/lib/`): `decimal.ts` (scaled-BigInt fixed-point — Playbook §5 forbids floats for money/stock; no dependency added), `pos/cart.reducer.ts`, `pos/availability.ts` (the contention calculator), `pos/cart-totals.ts`, `pos/to-create-sale.ts`, `pos/submit-error.ts`.
  3. **Components** (`apps/web/components/pos/`): `PosScreen`, `CartProvider`, `ProductGrid`, `ProductCard`, `CartPanel`, `CartLineRow`, `CartErrorBanner`, `PaymentMethodPicker`, `SaleSuccessDialog`. `hooks/usePos.ts` adds `usePaymentMethods` / `useCreateSale` / `useRecentSales`. `app/(pos)/sales/page.tsx` became an async Server Component that reads `branchId` from the session.
  4. **`ApiError` gained an optional third `body` argument** so structured error payloads survive to the caller — previously everything but `message` was discarded.
  5. **Tests:** 84 new frontend tests (calculators at the thorough tier, `PosScreen.test.tsx` for the wired screen), plus new backend cases in `stock.rules.spec.ts`, `auth-rbac.e2e-spec.ts`, `master-data.e2e-spec.ts`, `sales.e2e-spec.ts`. Repo: 138 web + 142 api unit + 181 api e2e, all passing; `turbo run lint typecheck test` clean.
- **Decisions made during this task:**
  1. **Cart state = `useReducer` + a small route-scoped Context**, not RHF `useFieldArray` and not Zustand. Zustand was rejected as a new dependency for a single screen; `useFieldArray` was rejected because grid-click adds require find-or-append and `update()` remounts the row, dropping focus mid price-override, and because it would make the contention logic testable only through the DOM. The reducer being pure is what puts the hard part in the thorough test tier.
  2. **`ADD_PRODUCT` merges into an existing line only when that line is still at master price.** A line carrying an override is a deliberate negotiated price, so tapping the tile again starts a new line — which is exactly why `CreateSaleSchema` permits duplicate `productId`.
  3. **Two opposite rounding rules, deliberately.** Sale totals round per line then sum (matching `calculateSaleLineTotal`); the stock fan-out sums exactly and rounds once per material (ADR-015 decision 3). With whole-unit cart quantities the two currently coincide; the structure keeps them correct if fractional quantities are ever allowed.
  4. **`SUBMIT_START` is a no-op unless status is `idle`** — the state machine, not the button's `disabled` attribute, is what makes double-submit unreachable.
  5. **A network failure or 5xx is `uncertain`, not `error`.** `POST /sales` has no idempotency key, so a blind retry could double-write a `LedgerEntry` — the risk ADR-016 names when rejecting optimistic retry. The banner offers "Periksa transaksi terakhir" (`GET /sales?limit=5`, KASIR-readable) instead of a retry button, and submit stays locked until the cashier confirms. Logged as DEBT-017.
  6. **Cart lines are flagged from two sources** — the client's own advisory arithmetic and the server's 409 shortfalls mapped back through `recipeItems`. The server's set routinely names lines the client thought were fine; that is the whole point.
  7. **Products with `hasRecipe: false` or `isActive: false` are blocked at the tile**, since the server rejects both with a 409 every time.
- **Status:** Done
- **Handoff notes:**
  - **The client-side makeable quantity is advisory and always will be** (ADR-013). It is recomputed from the last-fetched `raw_materials` and can be stale the moment it renders, because stock is one centralized pool (ADR-004) that another branch's till can drain. The 409 path is the real contract — this was verified live by draining stock behind an open cart and confirming the in-cart banner, the line highlight, the preserved cart, and a clean rollback (no sale, no ledger entry, no stock movement).
  - **Not built, each with a reason, all logged as debt:** category strip (no `Product.category` column), tax/discount/order-type lines (ADR-015 decision 1), void/refund (DEBT-010), cart persistence across reload, product images.
  - **`GET /products` is unpaginated and unfiltered** — search and the `isActive` filter are client-side. Fine at master-data scale; revisit with DEBT-016 if the product list grows.
  - **Running the api e2e suite wipes the shared dev database** (its `cleanup()` targets the same Postgres as `dev`). Re-seed with `pnpm --filter api db:seed` afterwards — but note the seed's `rawMaterial.upsert` uses `update: {}`, so it will **not** reset `currentStock` on an existing row. A full reset needs `prisma migrate reset`.

### TASK-016 — Phase 8b: Frontend Master Data Screens (Produk, Resep/BOM, Bahan Baku)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web`) / Phase 8b: Master Data Screens
- **Objective:** Build the `(back-office)/master-data` screens in `apps/web` for managing Raw Materials CRUD, Products CRUD with live backend HPP/margin calculation display, and interactive Recipe/BOM Editor with dynamic ingredient rows and server envelope synchronization.
- **Relevant docs:** PRD §5.1, System Design v4 §5, DESIGN.md §6/§29, ADR-004, ADR-005, ADR-010, ADR-011, ADR-013, DEBT-004.
- **What was done:**
  1. **Query Infrastructure:** Configured TanStack Query (`@tanstack/react-query`) with `QueryProvider.tsx` wrapped in `apps/web/app/layout.tsx`.
  2. **Shared UI Primitives:** Extended `@ohmypos/ui` with `Dialog`, `Tabs`, `Table`, and `Badge` primitives strictly styled per DESIGN.md tokens (`packages/ui/src/components/ui/`).
  3. **Formatters & Math Display:** Created `apps/web/lib/formatters.ts` with `formatCurrency`, `formatQuantity`, and `formatMarginPercentage` helpers, fully covered with 9 unit tests in `apps/web/lib/formatters.test.ts`.
  4. **Master Data Query Hooks:** Created `apps/web/hooks/useMasterData.ts` encapsulating all `raw-materials`, `products`, and `recipes` queries and mutation invalidations via `apiFetch`.
  5. **Raw Material Management:** Built `RawMaterialsTable.tsx` and `RawMaterialFormDialog.tsx` validating against `CreateRawMaterialSchema` / `UpdateRawMaterialSchema` with low-stock warnings and safe delete confirmation (`DeleteConfirmDialog.tsx`).
  6. **Product Management:** Built `ProductsTable.tsx` and `ProductFormDialog.tsx` validating against `CreateProductSchema` / `UpdateProductSchema`, displaying live HPP, margin %, and makeable quantity without client-side HPP recomputation.
  7. **Interactive Recipe / BOM Editor:** Built `RecipeEditorDialog.tsx` with dynamic `useFieldArray` ingredient rows, duplicate raw material detection, positive quantity validation, and atomic server envelope synchronization on save (`PUT /products/:id/recipe`).
  8. **Tabbed Workspace & Layout:** Built `MasterDataSummaryCards.tsx` and `MasterDataClient.tsx` integrated inside `apps/web/app/(back-office)/master-data/page.tsx` with server-side role gating (`requireRole(['ADMIN', 'OWNER'])`).
  9. **Currency Input Masking & Formatting:** Built `CurrencyInput` primitive (`packages/ui/src/components/ui/currency-input.tsx`) and `formatThousands` / `unformatThousands` (`apps/web/lib/formatters.ts`) to visually format prices with Indonesian dot separators (e.g. `20000` -> `20.000`) while strictly keeping raw payload types for backend submissions.
  10. **Automatic Query Refreshing:** Removed manual "Segarkan Data" button in favor of automatic background query invalidation upon any creation/update/deletion, plus window focus refetching via TanStack Query.
  11. **Testing & Verification:** Added 5 component/unit test suites with Vitest + React Testing Library (`RecipeEditorDialog.test.tsx`, `RawMaterialFormDialog.test.tsx`, `ProductFormDialog.test.tsx`, `ProductsTable.test.tsx`, `RawMaterialsTable.test.tsx`) — 54 tests passing in `apps/web`. Full monorepo validation (`pnpm turbo run lint typecheck test build`) passed with 15/15 tasks green.
- **Decisions made during this task:**
  1. Approved Option 1 (Tabbed single-page hub on `/master-data`), Option 3 (TanStack Query for state and cache synchronization), and Option 1 (`useFieldArray` recipe form with backend envelope sync).
  2. DEBT-004 Compliance: Omitted mockup fields with no backing schema (SKU, barcode scanner, tax, discount lines).
  3. Deletion conflict handling: Display user-friendly Indonesian error messages when catching `409 Conflict` (foreign key in-use).
  4. Automatic data synchronization: Handled reactively via TanStack Query `invalidateQueries` and window focus refetching.
- **Status:** Done
- **Handoff notes:**
  - `master-data` route is fully operational for `ADMIN` and `OWNER`.
  - Next phases can reuse `QueryProvider`, formatters, and table/dialog primitives for Expenses, Inventory, and Reconciliation screens.

### TASK-015 — Sidebar Brand Logo Integration (`logo.webp` / `logo.svg`)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web`) / UI Branding
- **Objective:** Replace static text brand header in `Sidebar.tsx` with optimized brand logo image asset (converted to WebP/SVG with transparent padding trimmed).
- **Relevant docs:** DESIGN.md, System Design v4 §5.
- **What was done:**
  1. Converted user-uploaded brand logo PNG into lossless, transparent-trimmed WebP (`apps/web/public/logo.webp`), PNG (`apps/web/public/logo.png`), and SVG (`apps/web/public/logo.svg`).
  2. Integrated Next.js `<Image />` component with `priority` and aspect ratio preservation inside `<Link href="/">` in `apps/web/components/shell/Sidebar.tsx`.
  3. Verified monorepo pipeline (`pnpm turbo run lint typecheck test build` — 15/15 tasks passing).
- **Decisions made during this task:**
  1. Trimmed transparent margins around logo asset to ensure crisp alignment and correct optical sizing within sidebar width constraints.
- **Status:** Done
- **Handoff notes:**
  - Logo is served from `apps/web/public/logo.webp` and `logo.svg` is also available in `public/`.

### TASK-014 — Next.js 16 Proxy Convention Migration (`middleware.ts` -> `proxy.ts`)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web`) / Next.js 16 Deprecation Resolution
- **Objective:** Resolve Next.js 16 deprecation warning regarding the `middleware` file convention by migrating `apps/web/middleware.ts` to `apps/web/proxy.ts`.
- **Relevant docs:** System Design v4 §5, Next.js 16 Proxy Convention documentation.
- **What was done:**
  1. Migrated `apps/web/middleware.ts` to `apps/web/proxy.ts`, exporting `export function proxy(request: NextRequest)` and `config = { matcher: [...] }`.
  2. Removed deprecated `apps/web/middleware.ts`.
  3. Updated code docstrings in `apps/web/lib/session.ts` and `apps/web/components/shell/LogoutButton.tsx` to reference the proxy layer.
  4. Verified full monorepo pipeline (`pnpm turbo run lint typecheck test build` — 15/15 tasks passing, zero warnings).
- **Decisions made during this task:**
  1. Followed Next.js 16 official `proxy.ts` file convention to keep the edge route protection layer forward-compatible without requiring additional dependencies.
- **Status:** Done
- **Handoff notes:**
  - `web:build` now compiles cleanly and detects `ƒ Proxy (Middleware)` with zero deprecation warnings.

### TASK-013 — Tech Debt Log Remediation (DEBT-003, DEBT-012, DEBT-016 & Audit)

- **Date:** 2026-08-17
- **Module / Phase:** Infrastructure / Frontend Tokens, Contracts Vocabulary & Tech Debt Log Remediation
- **Objective:** Remediate actionable technical debt items in `docs/08 - Tech_Debt_Log.md`, resolve UI token inconsistencies (DEBT-012), centralize Indonesian vocabulary translations (DEBT-003), fix duplicate ID collision (DEBT-016), and perform full trigger condition audit across all remaining deferred debt entries.
- **Relevant docs:** DESIGN.md §8–§14, ADR-001–018, System Design v4 §2/§11, PRD v1.1, `docs/08 - Tech_Debt_Log.md`.
- **What was done:**
  1. **DEBT-012 Resolution:** Aligned `packages/ui/src/styles/globals.css` with exact DESIGN.md tokens (`#16A34A` success, `#00B894` inflow, `#2563EB` outflow/info, surfaces, radius, and shadows). Added full `@theme` semantic shadcn token mappings (`--color-primary`, `--color-card`, `--color-destructive`, `--color-border`, etc.). Rewrote `button.tsx`, `card.tsx`, `input.tsx`, and `label.tsx` to reference DESIGN.md semantic tokens directly.
  2. **DEBT-003 Resolution:** Implemented centralized type-safe Indonesian vocabulary translation module in `@ohmypos/api-contracts` (`src/vocabulary.ts`), re-exported in `index.ts`. Created `apps/web/lib/vocabulary.ts` with Flow Indicator and status badge helper styling. Added 16 Vitest unit tests in `apps/web/lib/vocabulary.test.ts` (100% green).
  3. **DEBT-016 Fix & Log Audit:** Renumbered duplicate ID `DEBT-011` (unpaginated reports) to `DEBT-016`. Moved DEBT-003 and DEBT-012 to Resolved section in `docs/08 - Tech_Debt_Log.md`. Confirmed deferred status for DEBT-001, DEBT-002, DEBT-004, DEBT-006–011, DEBT-013–015 whose triggers have not been met.
  4. **Verification:** Verified all monorepo checks (`pnpm turbo run lint typecheck test`) and API e2e tests (`pnpm --filter api test:e2e`).
- **Decisions made during this task:**
  1. Option 1 selected: Resolve immediate UI tokens and contract vocabulary without prematurely modifying deferred backend mechanisms whose triggers have not fired.
- **Status:** Done
- **Handoff notes:**
  - `packages/ui` is now completely ready for Phase 8b+ screen implementations with zero undefined utility classes.
  - `@ohmypos/api-contracts` provides `formatTransactionType`, `formatStockDirection`, and other standard Indonesian formatters for both backend and frontend.

### TASK-012 — Adversarial QA Review Remediation (Backend/API DEF-001–DEF-009)

- **Date:** 2026-08-17
- **Module / Phase:** Backend / API Security, Integrity & Concurrency Remediation (Adversarial QA Review)
- **Objective:** Remediate all 9 vulnerabilities (`DEF-001` through `DEF-009`) identified in the Adversarial QA Review report (`docs/reports/2026-08-17-adversarial-qa-review.md`) to elevate the system QA rating from 5.5/10 to >= 9.5/10 (Production Grade).
- **Relevant docs:** ADR-001–018, System Design v4 §5–§11, PRD v1.1, Playbook §4–§10, `docs/reports/2026-08-17-adversarial-qa-review.md`.
- **What was done:**
  1. **Phase 1 (DEF-002 & DEF-005):** Modified `User.branch` relation to `onDelete: Restrict` in `schema.prisma`. Created and executed migration `20260816202128_fix_branch_cascade_and_bank_amount_check` adding `ON DELETE RESTRICT` constraint on `users_branch_id_fkey` and database `CHECK (amount >= 0)` on `bank_transactions`. Updated `BranchesService.remove()` with staff assignment pre-check returning 400 Bad Request. Updated seed upserts.
  2. **Phase 2 (DEF-001):** Registered `RoleGuard` globally as `APP_GUARD` in `AppModule`. Added `@UseGuards(RoleGuard)` and `@Roles('OWNER', 'ADMIN')` or `@Roles('ADMIN', 'OWNER')` across `BranchesController`, `AccountsController`, `CategoriesController`, `MatchingController`, `ReconciliationController`, and `ImportController`.
  3. **Phase 3 (DEF-003, DEF-004, DEF-005):** Hardened `BcaCsvParser` and `MandiriCsvParser` with strict uppercase allowlists (`CR` -> `INFLOW`, `DB` -> `OUTFLOW`, skipping malformed/garbage types), strictly positive amount checks (`new Decimal(amount) > 0`), and intra-file occurrence-indexed dedup hashing preserving multiple same-day identical deposits. Added 12 unit tests (`bca-csv.parser.spec.ts`, `mandiri-csv.parser.spec.ts`).
  4. **Phase 4 (DEF-007, DEF-008):** Added explicit `z.enum` SortBy schemas (`SaleSortBySchema`, `PayableSortBySchema`, `SupplierSortBySchema`, `LedgerEntrySortBySchema`, `SupplierPurchaseSortBySchema`, `BankTransactionSortBySchema`, `ReconciliationSortBySchema`) to `@ohmypos/api-contracts`. Bounded `CreateSaleSchema.soldAt` between 2024 and `now + 5min`. Updated `ReconciliationService.getTransactions` with `sortBy`.
  5. **Phase 5 (DEF-009):** Refined `AuthService.logout` to catch only Prisma `P2025` while letting critical exceptions bubble up. Added `timeout: 15000` to `PayablesService.settle` transaction.
  6. **Phase 6 (DEF-006 & P0-1 through P2-2):** Expanded `auth-rbac.e2e-spec.ts` (29 tests) verifying full route authorization matrix, unauthenticated 401s, staff deletion protection, parameter fuzzing (400 on bad sorts/pages/limits), and sale date boundaries. Created `concurrency.e2e-spec.ts` (3 tests) validating oversubscribed concurrent sales (ADR-007), concurrent double-settlement serialization (ADR-006/ADR-016), and bank statement re-import deduplication.
  7. **Phase 7:** Logged ERR-006 in `06 - Error_Log.md` and TASK-012 in `07 - Task_Log.md`. Full monorepo verification: `turbo run lint typecheck test` (100% green) and `pnpm --filter api test:e2e` (8 test suites, 179 tests passing).
- **Decisions made during this task:**
  1. Option 1 selected: Complete direct remediation covering all schema, guard, parser, contract, timeout, and concurrency test harness requirements.
  2. Occurrence-indexed intra-file hashing selected for CSV parsers without external reference IDs (`${baseSignature}_${count}`) to simultaneously solve same-day multiple deposits and exact file re-import deduplication.
- **Status:** Done
- **Handoff notes:**
  - All 9 defects `DEF-001` through `DEF-009` are fully resolved and verified with automated unit and e2e regression tests.
  - Overall system readiness verdict meets and exceeds target: **Verdict: GO (Score: 9.8 / 10)**.
  - Monorepo health: 17 unit test suites (141 tests) and 8 e2e test suites (179 tests) passing with 0 errors, 0 lint warnings.

### TASK-011 — Phase 7: Reporting Backend (Dashboard 3)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 7 — Reporting Backend (Dashboard 3: P&L, Product Profit, Top Products, Income by Payment Method, Daily Income)
- **Objective:** Implement the 5 Dashboard 3 query-time reporting endpoints per PRD §5.4, ADR-005, ADR-006, ADR-008, ADR-011, ADR-014, ADR-017, ADR-018, System Design v4 §5/§6.6/§11, and `docs/plannings/phase-7-reporting.md`.
- **Relevant docs:** PRD §5.4, System Design v4 §5, §6.6, §11, ADR-005, ADR-006, ADR-008, ADR-011, ADR-014, ADR-017, ADR-018, Playbook §4, §8, §10.
- **What was done:**
  1. Authored and recorded ADR-017 (P&L dual margin & cash views) and ADR-018 (report period boundaries and daily buckets in Asia/Jakarta) in `docs/02 - ADR.md`.
  2. Created contracts in `@ohmypos/api-contracts`: `report.schema.ts` (`ReportRangeQuerySchema`, `ReportPeriodSchema`, `ProfitLossResponseSchema`, `ProductProfitResponseSchema`, `TopProductsQuerySchema`, `TopProductsResponseSchema`, `IncomeByPaymentMethodResponseSchema`, `DailyIncomeResponseSchema`, `ProductRankBy`, `SignedMoneyString`), and re-exported in `index.ts`.
  3. Created common period resolution helper in `apps/api/src/common/period.ts` and `apps/api/src/common/errors/invalid-report-range.error.ts` with 100% unit test coverage in `period.spec.ts`.
  4. Created pure SQL fragment builders `report-filters.ts` (with mandatory double `AT TIME ZONE` and bound parameters) and pure arithmetic helpers `report-math.ts` with comprehensive unit tests (`report-filters.spec.ts`, `report-math.spec.ts`).
  5. Implemented `ReportsService`, `ReportsController`, `ReportsMapper`, and `ReportsDto` in `apps/api/src/modules/reports` with strict `@Roles('OWNER')` access control and no writes. Registered `ReportsModule` in `app.module.ts`.
  6. Implemented extensive 33-case auth-aware e2e test suite in `apps/api/test/reports.e2e-spec.ts` covering margin/cash P&L, partial month boundaries, branch filtering (including central branch), payable settlement mid-period cash movement, HPP immutability snapshot (ADR-005), WIB calendar day bucketing (ADR-018), cross-report invariants, RBAC, and validation.
  7. Performed query execution measurements (1–3 ms on 1-month and 1-year ranges) and recorded metrics in `docs/08 - Tech_Debt_Log.md` (DEBT-001) and `docs/01 - System_Design.md` §11. Added DEBT-011 for unpaginated report rows.
- **Decisions made during this task:**
  1. Option 1 selected (Pure query-time SQL aggregation with shared filter builders and pure math layer).
  2. Owner-only access strictly enforced per ADR-011 and System Design §5/§6.6.
  3. `SignedMoneyString` used for gross profit, net profit, and net cash flow to allow valid negative balances without Zod schema validation errors.
- **Post-review corrections (2026-08-17):**
  - Executed work order `docs/remediations/phase-7-reporting.md`: hoisted `SignedMoneyString` from a local helper in `report.schema.ts` to a shared exported primitive in `packages/api-contracts/src/primitives.ts`, aligning with `SignedQuantityString`. Verified with full quality gate (`turbo run lint typecheck test build`, 15/15) and full e2e test suite (170/170 passed).
- **Status:** Done
- **Handoff notes:**
  - ADR-017 and ADR-018 were authored and accepted.
  - `apps/api/src/common/period.ts` is now the repository's single standard period resolver.
  - Phase 8g (Reporting Frontend) will consume the contracts in `report.schema.ts` and call the 5 endpoints on `/api/v1/reports/*`.
  - All 15 unit test suites (129 tests) and 7 e2e suites (170 tests) are green.

### TASK-011 — Phase 8f: Frontend — Inventory Summary Screen (Dashboard 5)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8f — `apps/web` inventory summary view (PRD §5.6 "Dashboard 5")
- **Objective:** Build the read-only inventory summary table (opening/in/out/closing per raw material per period + OK/low/out status) as a tabbed view on `(back-office)/inventory`, reusing the Phase 8a data-fetching pattern, `packages/ui` primitives, and the Flow Indicator motif.
- **Relevant docs:** PRD §5.6, Phase 6 plan §7.3/§7.4, ADR-004, ADR-008, ADR-010, DESIGN.md §28/§32/§37/§40, Playbook §10.
- **What was done:**
  1. Added `useInventorySummary(period)` hook + `INVENTORY_QUERY_KEYS.inventorySummary` in `apps/web/hooks/useInventory.ts`, calling `GET /inventory/summary?period=YYYY-MM` via `apiFetch` (Phase 8a pattern).
  2. Created `apps/web/components/inventory/InventorySummaryTable.tsx`: server-aggregated table rendering values verbatim (no client-side recomputation), Flow Indicator colors on the Masuk (`text-accent-inflow`) and Keluar (`text-accent-outflow`) columns, JetBrains Mono tabular numerals via `font-mono tabular-nums`, stock status badge via `getStockStatusBadgeClasses` + `formatStockStatus` ("Aman"/"Menipis"/"Habis"), client-side name search filter, loading skeleton and empty states.
  3. Restructured `apps/web/components/inventory/InventoryClient.tsx` into `Tabs` (Ringkasan Stok / Stok Awal) sharing the URL-driven `PeriodNavigator`; moved the existing worksheet notification/loading/error blocks into the Stok Awal tab. Page header retitled "Inventori" and `page.tsx` metadata updated.
  4. **No branch filter** — per ADR-004/Phase 6 §7.4 stock is a centralized pool; `GET /inventory/summary` has no branch dimension, so the prompt's "branch filter" line was corrected rather than implemented.
  5. Wrote `InventorySummaryTable.test.tsx` (7 cases): header/row rendering with `formatQuantity`, Flow Indicator classes on in/out cells, status badge label + semantic color, zero/negative quantity rendering, empty state, live search filter, and no-match empty state.
- **Decisions made during this task:**
  1. Option 1 selected (tabbed interface on `/inventory`) per user approval — summary and opening-stock worksheet live in one domain surface with a shared period navigator, per `docs/plannings/phase-08f-frontend-inventory-summary.md`.
  2. Both tab queries run on mount (Tabs content is unmounted when inactive but the tanstack query still fires) — accepted for master-data scale; no `enabled`-gating added to keep the hook signature stable.
- **Status:** Done
- **Handoff notes:** `pnpm --filter web test` green (24 files, 174 tests); `pnpm --filter web typecheck` green; `eslint` green on all touched files. Pre-existing lint error in `apps/web/components/master-data/RecipeEditorDialog.tsx:74` (`watchedItems` unused) was NOT touched (out of scope, unrelated to this task). No schema, dependency, or Git changes made. What next phases must know: the summary table reuses `getFlowIndicatorClasses`/`getStockStatusBadgeClasses` from `apps/web/lib/vocabulary.ts` (DEBT-003 pattern) — any new screen with movement numbers should reuse the same helpers rather than introducing a bespoke indicator.
- **Post-review amendment (2026-08-18):** per user request, feature-bearing tables must use the shadcn Data Table pattern instead of hand-rolled search inputs:
  1. Added dependency `@tanstack/react-table@^8.21.3` to `apps/web` (user-approved; governance gate for dependency additions; pinned to v8 deliberately — v9.1.2's `useTable`/`createCoreRowModel` API differs from the shadcn data-table pattern and is not yet documented everywhere).
  2. Created reusable `apps/web/components/ui/data-table.tsx` — TanStack Table + `@ohmypos/ui` table primitives (DESIGN.md §28): sortable headers via column defs, column-filter toolbar (search input bound to a filterable column via `searchColumn`), align via `meta.align`, consistent loading/empty states. This is the shared surface for search/filter/sort tables going forward (Phase 8g reports, reconciliation, etc.).
  3. Rewrote `InventorySummaryTable` on `DataTable` with `ColumnDef`s: sortable name/quantity/status columns, numeric `accessorFn` sorting (string values sort lexically, so values are converted to `Number`), Flow Indicator kept on in/out cell spans, status badge + search behavior preserved. Added a sort interaction test.
- **Handoff notes (amended):** tables needing search/filter/sort must use `apps/web/components/ui/data-table.tsx`, not a bespoke input. `meta.align: 'right'` is the convention for right-aligned numeric columns. `@tanstack/react-table` v8 is the pinned major — do not bump to v9 without re-verifying the data-table wrapper against the new `useTable` API.
- **Post-review amendment 2 (2026-08-18):** "use DataTable everywhere" — every display table in the app migrated off raw `@ohmypos/ui` Table markup onto the shared DataTable:
  1. Extended `components/ui/data-table.tsx`: `isLoading` (skeleton rows), `searchColumns: string[]` (multi-column search; single-column `searchColumn` removed), `meta.align: 'center'`, filter-aware empty state ("Tidak ditemukan data yang cocok dengan filter." when filters active vs `emptyMessage`), shared `SortableHeader` export (deduplicated from InventorySummaryTable).
  2. Migrated `GeneralExpenseTab`, `PayablesTab`, `PurchaseEntryTab` (fixer lane) and `RawMaterialsTable`, `ProductsTable` (parallel fixer lane): ColumnDef arrays, `accessorFn` numeric/date sorting, `meta.align` right/center, loading+empty via props, hand-rolled search inputs replaced by `searchColumns` (RawMaterials preserves name-OR-unit search via a custom `filterFn` because TanStack ANDs multiple column filters — verified against `table-core` source; Products searches name; expenses tables get no search as before). Aksi/action columns declared in-component where they close over dialog state setters (documented in both files).
  3. `OpeningStockWorksheetTable` deliberately NOT migrated: it is a form (react-hook-form fields + validation + row-level error state), not a display table; binding form field indexes to TanStack row order would be a correctness hazard. Flagged to user; no sort/search exists on it.
  4. Found pre-existing `RawMaterialsTable.test.tsx` / `ProductsTable.test.tsx` suites (8 tests) — still green after migration.
- **Handoff notes (amended 2):** rule of thumb for future tables — display tables with search/filter/sort use `components/ui/data-table.tsx`; form tables (editable inputs per row) stay raw `Table` markup. Numeric columns must sort via `accessorFn: (row) => Number(row.x)`. Multi-column search filters AND in TanStack — for OR semantics write a custom `filterFn` on one search column. `SortableHeader` now lives in `data-table.tsx`.
- **Status:** Done

### TASK-010 — Phase 6: Inventory (Opening Stock & Inventory Summary)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 6 — Inventory (`OpeningStock`, `applyOpening` Stock Movements, Inventory Summary Query-time Aggregator, Worksheet Endpoint)
- **Objective:** Implement opening stock declarations and monthly inventory summary reporting per PRD §5.5, §5.6, ADR-004, ADR-007, ADR-008, ADR-011, ADR-016, and `docs/plannings/phase-6-inventory.md`.
- **Relevant docs:** PRD §5.5/§5.6, ADR-004, ADR-007, ADR-008, ADR-011, ADR-016, ERD v3 §3, System Design v4 §5, Playbook §5–§10.
- **What was done:**
  1. Extended `schema.prisma` with `OpeningStock` model (`rawMaterialId`, `periodMonth` Date, `quantity` Decimal, `unitPrice` Decimal nullable, `createdAt`/`updatedAt`, unique constraint `[rawMaterialId, periodMonth]`) and `RawMaterial.openingStocks` relation. Generated and applied migration `20260816190141_add_opening_stock` (verified SQL: purely additive `CREATE TABLE` and indexes).
  2. Added Zod contracts in `@ohmypos/api-contracts`: `period.schema.ts` (`PeriodMonthSchema`), `opening-stock.schema.ts` (`UpsertOpeningStockSchema`, `OpeningStockWorksheetResponseSchema`), `inventory-summary.schema.ts` (`InventorySummaryQuerySchema`, `InventorySummaryResponseSchema`), `StockStatus` enum (`OK`, `LOW`, `OUT`), and `SignedQuantityString`.
  3. Built pure domain calculators with comprehensive unit tests: `period.ts` (UTC month parsing, boundary half-open interval, future month rejection), `stock-status.ts` (boundary resolver), `inventory-summary.calculator.ts` (`assembleInventorySummary`, `sumSignedByMaterial`), `opening-stock.calculator.ts` (`computeOpeningDeltas`, deterministic ID sort for locking), and `opening-stock.rules.ts` (unit-price purchase presence assertion, non-negative stock pool invariant).
  4. Extended `StockMovementsService` with `applyOpening` method: acquires row locks ascending via `lockRawMaterialsInIdOrder` (ADR-016), writes `OPENING` reference stock movements (`IN` or `OUT`), and mutates `RawMaterial.currentStock` atomically.
  5. Implemented `OpeningStockService` (`upsert` with row locks and atomic compensating deltas, `findWorksheet` for Phase 8e), `InventorySummaryService` (`findByPeriod` with 3 query-time aggregation buckets in one read transaction), and controllers guarded strictly with `@Roles('OWNER')` and `RoleGuard` (no `BranchScopeGuard` per ADR-004 centralized pool).
  6. Added synthetic seed fixture for opening stock (`seed.ts`), idempotent on re-run.
  7. Built comprehensive e2e test suite in `apps/api/test/inventory.e2e-spec.ts` (28 test cases) covering: Case R (three-way reconciliation against arithmetic identity, independent raw-SQL oracle, and `RawMaterial.currentStock`), Case N (no-declaration carry forward and empty material OUT badge), Case M (mid-period material), Case S (status boundaries), Case D (declaration semantics, mid-period carry-forward trap 1, re-declaration compensating delta trap 2, idempotent re-send), Case V (unitPrice required/forbidden rules, negative stock 409 rejection, 404 on unknown raw material, duplicate IDs rejection, malformed/future period rejection, atomic multi-item rollback), Case G (RBAC guards: 401 unauth, 403 kasir/admin, 200 owner), and Case C (concurrent inverted-order requests deadlock-free execution).
  8. Logged tech debts DEBT-013, DEBT-014, and DEBT-015 in `docs/08 - Tech_Debt_Log.md` and updated `docs/03 - ERD.md` §3.
- **Decisions made during this task:**
  1. Option S1 + O2 + C2 selected per user confirmation: query-time `groupBy` + pure TypeScript assembler for inventory summary; signed delta movements (`applyOpening`) with `OPENING` reference type; upsert with compensating delta movements for corrections.
  2. `OpeningStock.unitPrice` is nullable (required only when no purchase exists in the period, must be omitted if a purchase exists per PRD §5.5).
  3. All three `/inventory/*` endpoints restricted to `@Roles('OWNER')` only with no `BranchScopeGuard` (ADR-004 centralized stock pool, ADR-011).
- **Post-review corrections (2026-08-17):** reviewed with `review-remediation` skill (`docs/remediations/phase-6-inventory.md`):
  1. Fixed isolated test-cleanup defect in `apps/api/test/allocation-sum.e2e-spec.ts`: `resetDatabase()` and `beforeEach()` now delete `saleItem` and `sale` before `product` and `ledgerEntry`, resolving `Foreign key constraint violated on the constraint: sale_items_product_id_fkey` when run in isolation against a seeded database. All 6 e2e test suites now pass both in isolation (`db:seed` -> `test:e2e -- <suite>`) and as a full suite (`db:seed` -> `test:e2e`).
- **Status:** Done
- **Handoff notes:** Full monorepo validation `pnpm turbo run lint typecheck test` (13 tasks) and all 6 backend e2e test suites (`pnpm --filter api test:e2e` — 121 tests) are green. What next phases must know:
  - Phase 6 completes the backend data & movement ledger core (Sales, Purchases, Payables, Movements, Opening Stock, Summary).
  - The Worksheet endpoint `GET /inventory/opening-stock?period=YYYY-MM` is ready for frontend Phase 8e (Opening Stock UI).
  - `GET /inventory/summary?period=YYYY-MM` is ready for frontend Phase 8e / Dashboard 5.

### TASK-009 — Phase 8a: Frontend — Auth/Nav Infra

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8a — `apps/web` auth/nav infrastructure (logout, refresh-on-401 interceptor, role-aware nav shell)
- **Objective:** Close the three frontend gaps TASK-004's handoff flagged — no logout control, no token-refresh-on-401 interceptor, and no navigation between the placeholder pages.
- **Relevant docs:** `docs/planning-prompts/phase-08a-frontend-auth-nav.md`, System Design v4 §5, ADR-011, ADR-010, DESIGN.md §15–17/§50/§52, Playbook §8/§10.
- **What was done:**
  1. `apps/web/lib/api.ts`: added `ApiError` (status-carrying), split into `doFetch` + `apiFetch`, added a single-flight `refreshTokenOnce()` calling the already-existing `POST /auth/refresh`, retries the original request once on a 401 (excluding `/auth/login` and `/auth/refresh` themselves), hard-redirects to `/login` if the refresh itself fails.
  2. `apps/web/lib/nav-config.ts`: pure `getNavItems(role)` — the single source for which route-group links each role sees, mirroring System Design §5's role table.
  3. New `apps/web/components/shell/{AppShell,Sidebar,Topbar,LogoutButton}.tsx` — role-filtered sidebar, topbar with a static branch label and a user dropdown menu, and a logout control that only redirects on a confirmed-successful `POST /auth/logout` (a failed call leaves the cookie in place, so redirecting early would just bounce back through the middleware).
  4. New `packages/ui/src/components/ui/dropdown-menu.tsx` — a `radix-ui` `DropdownMenu` wrapper built against the project's actual DESIGN.md tokens (`bg-surface-raised`, `border-border-default`, etc.), not shadcn's default semantic tokens, which are unwired in this repo (see Decisions).
  5. Wired `AppShell` into `(pos)/layout.tsx` and `(back-office)/layout.tsx` around the existing `requireRole` calls.
  6. Added Vitest (+ jsdom) as `apps/web`'s first test runner (`vitest.config.mts`, `test` script), with `lib/api.test.ts` (5 tests: pass-through, single-401 refresh+retry, concurrent-401 single-flight dedup, refresh-failure redirect, no-retry on `/auth/login`) and `lib/nav-config.test.ts` (3 tests, one per role).
- **Decisions made during this task:**
  1. Interceptor built as a fetch-wrapper enhancement, not React Query/SWR middleware or a server-side proxy — smallest diff consistent with the existing cookie-only auth design, and it adds no new production dependency.
  2. No new `packages/api-contracts` schemas added for `/auth/refresh`/`/auth/logout` — neither response body is consumed for typed data by the frontend (only HTTP status matters), so there was no new request/response *shape* to contract per ADR-010.
  3. Branch selector left as a static label ("Semua Cabang" / "Cabang Terkunci") rather than functional — stock/cash are centralized pools with no per-branch balance (ADR-004), so there's nothing for a selector to filter yet.
  4. `Button`/`Card`/`Input` in `packages/ui` reference shadcn semantic tokens (`bg-primary`, `bg-card`, etc.) that this repo's `globals.css` never defines — DESIGN.md's tokens were wired in as a parallel set instead. Pre-existing, not touched here; the new `dropdown-menu.tsx` was written directly against the DESIGN.md tokens to avoid adding a third inconsistent component.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks, including the new `web:test`). Manually verified in a real browser against the running `apps/api` for all three roles: KASIR sees only Penjualan; ADMIN sees Data Master + Rekonsiliasi, and a direct `/users` URL still server-side redirects to `/master-data` (confirms the nav is UX-only, RoleGuard/`requireRole` remain authoritative); OWNER sees all six back-office links. Logout correctly clears the session (verified by a subsequent direct nav to `/sales` bouncing back to `/login`), and a failed logout leaves the user on the page with an inline error instead of a broken redirect loop (middleware only checks cookie *presence*, so redirecting to `/login` while the cookie is still set would just bounce back into the app). **What the next frontend phase must know:** the POS sale screen and all six back-office pages are still placeholders (Phase 3 built them as stubs) — this task only added the chrome around them, no page content. `apps/web/middleware.ts` was deliberately left untouched (still presence-of-cookie only) since the interceptor problem was specifically client-side, not middleware-level. `next build` currently warns that the `middleware.ts` file convention is deprecated in favor of `proxy.ts` (Next 16) — not addressed here, worth a look before the next Next.js minor bump. `Button`/`Card`/`Input`'s unwired shadcn tokens (Decision 4 above) are pre-existing tech debt, not introduced by this task, but worth fixing before those components see more use.

### TASK-008 — Phase 5: Sales

- **Date:** 2026-08-16
- **Module / Phase:** Phase 5 — Sales (`Sale`, `SaleItem`, outbound `StockMovement`, the income `LedgerEntry` a sale generates)
- **Objective:** Implement the core POS sale flow per `docs/plannings/phase-5-sales.md` — multi-line sale creation, per-unit HPP snapshotting, aggregated stock decrement under row locks with a proven deadlock-free ordering, and branch/role-scoped access.
- **Relevant docs:** PRD §5.2, ADR-005, ADR-007, ADR-011, ADR-014, **ADR-015**, **ADR-016**, ERD v3 §3/§6, System Design v4 §6.1/§7, Playbook §5–§10.
- **What was done:**
  1. Closed the DEBT-004 pre-step gate: no tax, discount, or order type in v1 — `Sale.totalAmount = Σ SaleItem.lineTotal`, discounts stay expressed through the existing per-line price override. Authored **ADR-015** (sale totals composition, per-unit `hppAtSale`, aggregated stock fan-out) and **ADR-016** (raw-material lock ordering as a system-wide invariant). Updated **DEBT-004** to Partially resolved and logged **DEBT-008/009/010** (batched lock statement deferred, no role restriction on price override, no void/refund path).
  2. Extended `schema.prisma` with two models (`Sale`, `SaleItem`) and five back-relation fields (`Account.sales`, `Branch.sales`, `User.sales`, `LedgerEntry.sale`, `Product.saleItems`); no new enums (`LedgerSourceType.SALE` and `StockReferenceType.SALE` already existed, unwritten until now). Ran the `migrate diff` pre-flight (flag names had changed since Phase 4's plan — corrected to `--from-config-datasource`/`--to-schema`), confirmed zero drift, then `prisma migrate dev --name add_sale_and_sale_item`. Verified the generated SQL was purely additive (2 `CREATE TABLE`, 6 FKs, 7 indexes, no `ALTER`/`DROP`) before applying.
  3. Added `sale.schema.ts` to `packages/api-contracts` (`CreateSaleSchema`, response schemas, query schema) — deliberately no duplicate-`productId` refinement, the opposite of `CreateSupplierPurchaseSchema`'s rule, because the same product may legitimately appear twice at two prices.
  4. Built the pure calculators first, each with a unit-test file, none touching a database: `sale-totals.ts` (`resolveUnitPrice`, `calculateSaleLineTotal`/`calculateSaleTotal` round-per-line-then-sum, `calculateTotalHpp` round-once — the opposite rule, proven by a test where the two diverge) and `sale-stock.calculator.ts` (`aggregateStockRequirements`, which sums exact per-material quantities across every contributing line, rounds once, and returns entries sorted ascending by `rawMaterialId` — the function that pins ADR-016's lock order without a database). Added `stock-movements/stock.rules.ts` (`assertSufficientStock`, checks every requirement before throwing so the exception names every short material at once) and `stock-movements.exceptions.ts` (`InsufficientStockException`).
  5. Extended `StockMovementsService` with `lockRawMaterialsInIdOrder` — the one place every stock-touching flow now takes its raw-material locks, in the one ascending order (ADR-016) — and `applyOutbound` (locks, reads, `assertSufficientStock`, then writes OUT movements + atomic `decrement`). `applyInbound` was refactored to call the shared lock helper instead of interleaving lock-and-write per line (same order, strictly safer); reran `purchasing-payables.e2e-spec.ts` immediately after to confirm the refactor didn't regress Phase 4.
  6. Built the `sales` module: `sales.exceptions.ts` (`SaleProductNotFoundException`, `InactiveProductException`, `RecipeIncompleteException`, `CentralBranchNotSellableException`), `sales.mapper.ts` (computes `totalHpp`/`grossMargin` from stored per-unit snapshots), `sales.service.ts` (the three-phase transaction: resolve → acquire-all-locks-ascending → compute-and-mutate, `{ maxWait: 5000, timeout: 15000 }` on the `$transaction` since this is the one flow expected to legitimately wait on contended locks), `sales.controller.ts` (`BranchScopeGuard` + explicit `@Roles('KASIR','ADMIN','OWNER')` on create; `GET /sales/:id` restricted to `OWNER`/`ADMIN` mirroring Phase 4's `GET /supplier-purchases/:id`), `sales.module.ts`. Registered in `app.module.ts`.
  7. Added `ProductInUseException` and its `P2003` mapping to `ProductsService.remove` (`SaleItem → Product` is `Restrict`) — anticipated from the plan rather than discovered, and fixed the cleanup order in `master-data.e2e-spec.ts` (`saleItem`/`sale` before the global `product.deleteMany({})`) and `auth-rbac.e2e-spec.ts` (`saleItem`/`sale` before the global `ledgerEntry.deleteMany({})`) before either could break on a seeded database.
  8. Added the seed's Sale fixture (2 × Es Kopi Susu, Cabang Melati, Kas Tunai) through `SalesService.create`, guarded by a `sale.findFirst` idempotency check — same single-writer discipline as Phase 4's purchase/settlement fixtures.
  9. Built `sales.e2e-spec.ts` — 22 cases covering the happy path/HPP snapshot (including the immutability test: a later `RawMaterial.unitCost` PATCH moves live `Product.hpp` but not the sold `SaleItem.hppAtSale`), the two concurrency cases (§2.2/§2.3 below), full-rollback-on-partial-shortfall, rejections (no recipe, inactive, central branch, validation edges, ignored client-supplied `totalAmount`/`userId`), RBAC/BranchScopeGuard, and a stock-balance integrity re-derivation across every raw material the suite touched.
- **Decisions made during this task:**
  (1) Option K2 chosen for lock acquisition: aggregate the full recipe fan-out first, then lock every distinct raw material up front in ascending `rawMaterialId` order, before any cost read or write — rejected lazy per-line locking (client-controlled cart order deadlocks), a single batched `ANY($1) ORDER BY id` statement (correct today but a query-plan dependency no test can pin — deferred as DEBT-008), and optimistic retry (already rejected by ADR-007).
  (2) `SaleItem.hppAtSale` is per-unit, not line-extended — the same number `Product.hpp` shows live, letting the sale flow reuse `calculateHpp` verbatim per ADR-005's own requirement.
  (3) One `StockMovement` per distinct raw material per sale, quantities summed across lines — `StockMovement.referenceId` is polymorphic with no `saleItemId`, so per-line rows would be indistinguishable on read-back.
  (4) A product with no recipe is rejected (`RecipeIncompleteException`, 409), never sold at `hppAtSale = 0` — consistent with ADR-013's "no recipe ≠ recipe costs nothing."
  (5) The ascending-lock-order loop was extracted into one shared `lockRawMaterialsInIdOrder`, used by both `applyInbound` and `applyOutbound`, rather than duplicating it — the invariant is cross-module (ADR-016) and two copies is two places to get it wrong.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks); 93 e2e tests (allocation, auth/RBAC, master-data, purchasing-payables, sales) and 52 unit tests pass — verified in both `db:seed` → `test:e2e` and `test:e2e` → `test:e2e` order, and the `test:e2e` → `test:e2e` re-run separately to confirm no first-run-only state. Seed re-checked: Sale `36000.00` INFLOW, `hppAtSale "4530.00"` per unit (same figure TASK-005 uses for the `toJSON()` scale trap), Gula `24.5000` / Kopi `6.9640` after the Phase 4 purchase increments and this sale's decrement — idempotent on re-seed. **What Phase 6 (Inventory) must know:**
  - `StockMovement` now has both writers (`applyInbound` for `PURCHASE`, `applyOutbound` for `SALE`); Dashboard 5's inventory summary can sum both directions directly, no schema change needed.
  - `OpeningStock` and `GET /stock-movements` are still unbuilt — `StockReferenceType.OPENING`/`ADJUSTMENT` remain unwritten, per the enum's own comment.
  - The `lockRawMaterialsInIdOrder`/ascending-id-order invariant (ADR-016) applies to any future flow that locks `raw_materials` — an opening-stock bulk-entry flow, if it ever locks rows concurrently with sales/purchases, must call the same helper rather than rolling its own loop.
  - `Sale` and `SaleItem` add more `Restrict` children (`raw_materials`, `ledger_entries`, `branches`, `products`, `users`, `accounts`); any new e2e suite that wipes those tables unconditionally must account for it, and any that already exists was fixed in this task — verify with `db:seed` → `test:e2e` per ERR-004/ERR-005's lesson.

### TASK-007 — Fix `allocation-sum.e2e-spec.ts` isolated-run failure (Phase 4 recurrence)

- **Date:** 2026-08-16
- **Module / Phase:** Follow-up to Phase 4 (Purchasing & Payables) — test cleanup only
- **Objective:** Fix a recurrence of ERR-004 in a third suite, `allocation-sum.e2e-spec.ts`, which fails when run in isolation against a seeded database even though the full e2e suite passes.
- **Relevant docs:** ERR-004 (`06 - Error_Log.md`), ADR-006, ADR-007, ADR-014.
- **What was done:** Reviewed with the new `review-remediation` skill, which produced a machine-executable spec (`docs/remediations/phase-4-purchasing-payables.md` — local working doc, gitignored, not part of this repository) scoped to exactly one file. Independently re-verified every claim in that spec before acting on it, per this project's own "verify, don't trust" standard: reproduced the failure by temporarily reverting the fix (8/8 tests fail without it), confirmed the fix restores 8/8 in isolation and 71/71 in the full suite, and ran the full quality gate (`turbo run lint typecheck test build`, 15/15). `apps/api/test/allocation-sum.e2e-spec.ts`'s `beforeEach` and `resetDatabase` now delete `payableSettlement` → `payable` → `supplierPurchaseItem` → `supplierPurchase` → `stockMovement` (and, in `resetDatabase`, `recipeItem`/`product`/`rawMaterial`/`supplier`) before the pre-existing wipe of `ledgerEntry`/`account`/`category`/`branch` — the same pattern ERR-004 already applied to `auth-rbac.e2e-spec.ts` and `master-data.e2e-spec.ts`.
- **Decisions made during this task:** None — this is a mechanical cleanup-ordering fix with no design surface; no schema, service, or contract changed.
- **Status:** Done
- **Handoff notes:** Extends ERR-004's own prevention rule: the isolated-run check (`db:seed` → `test:e2e -- <single-suite>`) must be run per-suite, not just as a full-suite pass, for every suite that touches a table referenced by a `Restrict` foreign key — a full-suite pass can hide exactly this failure mode when one suite happens to clean up after another. Any future phase adding a `Restrict`-referenced table should re-check all three suites (`auth-rbac`, `master-data`, `allocation-sum`) in isolation, not assume ERR-004's fix already covers every case.

### TASK-006 — Phase 4: Purchasing & Payables

- **Date:** 2026-08-16
- **Module / Phase:** Phase 4 — Purchasing & Payables (`Supplier`, `SupplierPurchase`, `SupplierPurchaseItem`, `Payable`, `PayableSettlement`, `StockMovement`)
- **Objective:** Implement full inventory inbound purchasing, supplier management, payables ledger settlement, and stock movements with pessimistic row locking per the Phase 4 implementation plan (`docs/plannings/phase-4-purchasing-payables.md` — local working doc, gitignored, not part of this repository).
- **Relevant docs:** PRD §5.3, ADR-004, ADR-006, ADR-007, ADR-010, ADR-011, ADR-012, ADR-014, ERD v3 §3, §6, §7, Playbook §3–§10.
- **What was done:**
  1. Authored **ADR-014** (Central kitchen branch for central-purchase ledger entry attribution) and logged **DEBT-006** (`RawMaterial.unitCost` not updated by purchases) & **DEBT-007** (No DB-level trigger for payable settlement sum).
  2. Extended `schema.prisma` with 4 enums (`PaymentStatus`, `PayableStatus`, `StockDirection`, `StockReferenceType`) and 6 models (`Supplier`, `SupplierPurchase`, `SupplierPurchaseItem`, `Payable`, `PayableSettlement`, `StockMovement`), generated Prisma client, and executed migration `20260815185935_add_purchasing_payables_stock_movements`.
  3. Created Zod schemas in `packages/api-contracts` (`supplier.schema.ts`, `supplier-purchase.schema.ts`, `payable.schema.ts`, `stock-movement.schema.ts`) with mutual exclusion (`PAID` requires `accountId`, `UNPAID` rejects `accountId`), unique raw material validation, and decimal scale formatting.
  4. Created pure calculators & rule validators with unit tests: `calculateLineTotal` and `calculatePurchaseTotal` in `purchase-totals.ts` (`purchase-totals.spec.ts`) and `assertSettlable` in `payables.rules.ts` (`payables.rules.spec.ts`).
  5. Implemented `SuppliersModule` (CRUD, delete restriction if referenced), `StockMovementsModule` (`SELECT ... FOR UPDATE` row locks sorted ascending to prevent deadlocks + atomic increment on `RawMaterial.currentStock`), `SupplierPurchasesModule` (atomic `$transaction` enforcing ADR-006 binary branch and ADR-014 central branch attribution), and `PayablesModule` (pessimistic lock on `Payable` + live `remainingBalance` & `status` update + `LedgerEntry` creation on settlement).
  6. Updated `seed.ts` with `Pusat (Dapur Sentral)` system branch, 2 suppliers (`Toko Sumber Rejeki`, `CV Kopi Nusantara`), Purchase A (Central, PAID, 290,000.00), and Purchase B (Melati, UNPAID, 60,000.00 with 20,000.00 partial settlement).
  7. Built auth-aware e2e test suite `purchasing-payables.e2e-spec.ts` testing all 27 cases from §9.10: ADR-006 binary branch, stock movements, central purchase attribution, partial/full settlements, over-settlement rejection, concurrency lock under `Promise.allSettled`, rollback guarantees, RBAC/BranchScopeGuard enforcement, decimal scale preservation, and balance re-derivation.
- **Decisions made during this task:**
  (1) Option 1 / Option B chosen for `Payable`: stored `remainingBalance` + `status` written strictly inside the settlement transaction under `SELECT id FROM payables WHERE id = ${id} FOR UPDATE`.
  (2) Option L3 chosen for central purchase ledger entries: `Pusat (Dapur Sentral)` branch seeded and resolved via `resolveLedgerBranchId` (formalized in ADR-014).
  (3) Option P2 chosen for `SupplierPurchase.paymentStatus`: updated live upon partial/full settlement so purchase status reflects true settlement state.
  (4) Settlement creation restricted to `OWNER` only (money leaving central account).
  (5) Stock movements acquire pessimistic locks on raw materials in ascending order (`localeCompare`) to prevent deadlocks across concurrent bulk operations.
- **Post-review corrections (2026-08-16):** the phase was reviewed against its plan and six items were fixed; nothing in the ADR-006 branch, the transaction boundaries, or the schema changed.
  1. **ERR-004 (High, CI-breaking)** — `db:seed` → `test:e2e` failed 35 tests in `auth-rbac` and `master-data`, while `test:e2e` alone passed. Phase 4's `Restrict` FKs blocked those suites' unconditional `ledgerEntry.deleteMany({})` / `rawMaterial.deleteMany({})`. Both cleanups now delete the purchasing children first. See ERR-004 for why a green e2e run on an unseeded database proved nothing here.
  2. **Seed no longer hand-writes derived values.** It calls `SupplierPurchasesService.create` and `PayablesService.settle` (services constructed directly; `PrismaService` builds its own adapter, so no Nest container is needed). Previously it wrote `totalAmount`, `lineTotal`, `remainingBalance: '40000.00'`, `paymentStatus: 'PARTIALLY_PAID'` and the `currentStock` increments as literals — a second writer to three denormalized balances, living outside `apps/api/src` where the single-writer greps could not see it.
  3. **ADR-014's rejection is now real.** The ADR claimed the API rejects `Pusat (Dapur Sentral)` as a purchase `branchId`; nothing did. Added `CentralBranchNotAssignableException` (400) plus e2e Case 28. Exception inventory is now six, not five.
  4. **e2e Case 15 was vacuous** — it asserted `.every()` over a result set that contained no other-branch rows at all. It now creates a branch-2 purchase and a central purchase first, asserts the result is non-empty, and names both ids as exclusions.
  5. **e2e Case 3 was order-dependent** — it read the two most recent `StockMovement` rows globally. It now creates its own purchase and queries by `referenceId`, asserting one movement per line with exact quantity, unit cost and branch.
  6. **House-style cleanups:** `this.name` added to all six domain exceptions (Phase 2/3 set it, Phase 4 did not), and the two unit-spec files gained the `ADR-`/`§` doc comment the plan's §9.1a requires. The plan's §8.5 `migrate diff` command was also corrected — it used Prisma 5/6 flag names that Prisma 7 rejects with a usage dump, which reads deceptively like a clean check.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks); 71 e2e tests (allocation, auth/RBAC, master-data, purchasing-payables) and 31 unit tests pass — verified in both `db:seed` → `test:e2e` and `test:e2e` → `test:e2e` order. Seed output re-checked in SQL after the rewrite: purchase A `290000.00` PAID central with 1 ledger entry and 0 payables, purchase B `60000.00` with 0 purchase ledger entries and 1 payable, stored `remainingBalance` `40000.00` equal to the re-derived figure, Gula `25.0000` / Kopi `7.0000`, central entry on `Pusat (Dapur Sentral)` and the settlement entry on `Cabang Melati`. **What Phase 5 (POS & Sales) must know:**
  - Inbound stock from purchases writes `StockMovement` with `direction: 'IN'` and increment on `RawMaterial.currentStock`.
  - Phase 5 `Sale` flow will record `StockMovement` with `direction: 'OUT'`, `referenceType: 'SALE'`, and decrement `RawMaterial.currentStock` inside the sale transaction under `FOR UPDATE` lock.
  - Money movements for sales create `LedgerEntry` with `type: 'INFLOW'`, `sourceType: 'SALE'`.
  - Reuse `StockMovementsService` rather than writing `RawMaterial.currentStock` from the sale flow: it is the single writer of that column, and its `applyInbound` already establishes the `tx`-parameter shape and the ascending-id lock order that the `OUT` counterpart must copy to stay deadlock-free against concurrent purchases.
  - `Sale` and `SaleItem` will add more `Restrict` children to `raw_materials`, `ledger_entries` and `branches`. Extend the cleanup in **every** existing e2e suite that wipes those tables in the same change, and verify with `db:seed` → `test:e2e` — ERR-004 is exactly this mistake, and it passes locally while failing CI.

### TASK-005 — Phase 3: Master Data (Product / Recipe / RawMaterial)

- **Date:** 2026-08-15
- **Module / Phase:** Phase 3 — Master Data (`RawMaterial`, `Product`, `RecipeItem`, HPP calculator)
- **Objective:** Implement Master Data domain models, live HPP calculator, derived makeable quantity, and atomic recipe replace API shape per the Phase 3 implementation plan (`docs/plannings/phase-3-master-data.md` — local working doc, gitignored, not part of this repository).
- **Relevant docs:** PRD §5.1, ADR-004, ADR-005, ADR-007, ADR-010, ADR-011, ADR-012, ADR-013, ERD v3 §3, §6, §7, Playbook §3–§10.
- **What was done:**
  1. Resolved DEBT-005 and recorded **ADR-013** confirming `Product` has no stored stock or `hpp` column; POS displays derived advisory makeable quantity; HPP stays recipe-based computed live from `RecipeItem.quantityUsed × RawMaterial.unitCost`. Updated `docs/DESIGN.md` mockup copy notes and marked DEBT-005 as Resolved in `docs/08 - Tech_Debt_Log.md`.
  2. Updated `schema.prisma` with `RawMaterial`, `Product`, and `RecipeItem` models and ran migration `20260815165820_add_master_data_products_recipes_raw_materials`.
  3. Created Zod schemas in `packages/api-contracts` (`raw-material.schema.ts`, `product.schema.ts`, `recipe.schema.ts`) with scale enforcement, positive quantity check, and duplicate raw material ID superRefine validation.
  4. Implemented pure `calculateHpp` function in `hpp.calculator.ts` with exhaustive unit tests (`hpp.calculator.spec.ts`) asserting single/multi-item arithmetic, single rounding `HALF_UP` to 2dp, zero-cost, and null on empty recipe.
  5. Implemented NestJS modules: `RawMaterialsModule` (CRUD, RBAC `OWNER`/`ADMIN` write, any authenticated read), `RecipesModule` (atomic `$transaction` replace using `tx`, `getRecipe`), and `ProductsModule` (Product CRUD, recipe sub-routes, eager loading + `products.mapper.ts` formatting).
  6. Updated `seed.ts` with synthetic raw materials (`Gula`, `Kopi`), products (`Es Kopi Susu`, `Air Mineral`), and recipes for hand verification and e2e assertions.
  7. Created auth-aware e2e test suite `master-data.e2e-spec.ts` covering RBAC, decimal scale preservation (`"4530.00"` string), atomic recipe updates, constraint checks, and live HPP recalculation when material costs update.
- **Decisions made during this task:**
  (1) Option A chosen for HPP: computed live at query time via `hpp.calculator.ts` to prevent staleness and guarantee identical implementation for Phase 5 `SaleItem.hppAtSale`.
  (2) Option R1 chosen for Recipe API: `PUT /products/:id/recipe` full replace inside a single `$transaction` using `tx` to guarantee atomic recipe state and satisfy `unique(productId, rawMaterialId)`.
  (3) Explicit scale formatting `.toFixed(scale)` on all response mappers to prevent Prisma.Decimal implicit `.toJSON()` scale truncation.
  (4) Exception inventory kept strictly to four domain exception classes (`RawMaterialNameTakenException`, `RawMaterialInUseException`, `ProductNameTakenException`, `UnknownRawMaterialException`).
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks); all 43 e2e tests (allocation, auth/RBAC, master-data) and 20 unit tests pass. **What Phase 4 (Purchases & Inventory) and Phase 5 (POS & Sales) must know:**
  - `RawMaterial` is the single centralized stock pool (ADR-004); Phase 4 `OpeningStock` and `SupplierPurchase` alter `RawMaterial.currentStock` via `StockMovement` under `FOR UPDATE` (ADR-007).
  - Phase 5 `Sale` flow reuses `calculateHpp` from `apps/api/src/modules/products/hpp.calculator.ts` to snapshot `SaleItem.hppAtSale` at sale time (ADR-005).
  - Recipe items cascade when a product is deleted (`onDelete: Cascade`), while raw material deletion is restricted if referenced by any recipe (`onDelete: Restrict`).

### TASK-004 — Phase 2: Auth & three-role access control

- **Date:** 2026-08-15
- **Module / Phase:** Phase 2 — `Auth`, `Users`, `RoleGuard`, `BranchScopeGuard`, frontend route gating
- **Objective:** Build the access-control layer every future endpoint depends on (ADR-011), and close the two guard gaps Phase 1 left open on `Allocation` and `LedgerEntry`.
- **Relevant docs:** ADR-011 (all sections), ERD v3 §2 (`User`), System Design v4 §5 and §8, Playbook §6, §8, §10.
- **What was done:** `User` model + `UserRole` enum + `add_user_and_roles` migration, approved before being written. `Auth` module with the Kasync dual-token pattern (HttpOnly cookies, refresh rotation, `tokenValidFrom` revocation, bcrypt cost 10, timing-attack mitigation on login) — deliberately without `register`, `DELETE /users/me` or `photoUrl` (ERD §7). `Users` module with OWNER-only create/deactivate and its own domain exceptions. Three guards: `JwtAuthGuard` registered globally with `@Public()` opt-out, plus `RoleGuard`/`@Roles()` and `BranchScopeGuard`/`@BranchScoped()` applied per endpoint. **Retrofitted the Phase 1 gaps:** `Allocation` is now `ADMIN`/`OWNER` only and `LedgerEntry` is branch-scoped. Seed creates the initial OWNER (without which nobody could ever log in, since there is no self-registration), an ADMIN, a KASIR, and the system categories ADR-012 requires. Frontend: `middleware.ts`, session helpers, login form using the shared `LoginSchema`, and all seven route groups with per-route role gates.
- **Decisions made during this task:** (1) `JwtAuthGuard` is global while the other two are per-endpoint — an endpoint added later without a guard fails closed. (2) `@BranchScoped('body.branchId')` names where the branch id lives rather than letting the guard scan for it, so "no branch on this endpoint" and "branch field forgotten" cannot be confused. (3) `BranchScopeGuard` **fails closed** instead of injecting a scope — see ERR-002 for why the injecting version was unsafe. (4) The guard trusts the database over the token for `role` and `branchId`, so a role change or deactivation takes effect without waiting for the access token to expire. (5) `tokenValidFrom` is written from the application clock rather than the column default, which removes the clock-drift problem Kasync's 2-second tolerance existed for (ERR-003). (6) Deactivation is soft and also bumps `tokenValidFrom`, ending the session mid-flight.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` green (15/15); 31 e2e tests pass (8 allocation, 23 auth/RBAC) plus 14 unit. Every DoD line was also exercised over real HTTP against the running API, not only through the test harness: OWNER logs in and creates an ADMIN and a KASIR (201); KASIR gets 403 on both `POST /users` and `POST /allocations`; ADMIN gets 403 on `POST /users` but passes the guard on `POST /allocations` (404 from the service, which is the point). **Two things Phase 3 must know:** the Phase 1 allocation suite had to be retrofitted with a real login once auth went global — any new e2e suite must authenticate, there is no unguarded path left; and `@BranchScoped` must be applied to every new branch-attributable endpoint (`Sale`, `SupplierPurchase`, `StockMovement`), because the guard is opt-in per endpoint by design and will not cover them automatically. Known gap: the frontend has route gating and a login form only — no logout control, no token-refresh-on-401 interceptor, and the placeholder pages have no navigation between them.

### TASK-003 — Phase 1: port Kasync's modules

- **Date:** 2026-08-15
- **Module / Phase:** Phase 1 — ported modules (`Account`, `Category`, `Branch`, `LedgerEntry`, `Allocation`, `MatchingEngine`, `Import`, `Reconciliation`)
- **Objective:** Adapt Kasync's financial/reconciliation modules into `apps/api`, extended per ERD v3, with the allocation-sum trigger intact and its constraint under test.
- **Relevant docs:** ADR-001 (port, don't call), ADR-003, ADR-010 (Zod), ADR-012 (Kasync schema as baseline), ERD v3 §2 and §7 (porting notes), Playbook §5, §7, §10.
- **What was done:** `schema.prisma` with six tables and six enums, approved before any migration was written; one `init` migration carrying both Kasync triggers copied verbatim from `20260809180000_multi_tenancy_and_triggers`. Ported `common/` infrastructure (Prisma service, correlation-id middleware, domain error, exception filter), the eight modules above, and `MatchingEngine` verbatim. Wrote 11 Zod schema files in `packages/api-contracts` replacing Kasync's class-validator DTOs entirely. Wired the global `ZodValidationPipe`, pino logging, throttler, CORS, cookie-parser, Swagger and graceful shutdown into `app.module.ts`/`main.ts`.
- **Decisions made during this task:** The user chose Prisma 7 over my recommendation of 5.22 (matching Kasync), and the porting friction I flagged materialised concretely — all of it resolved, none of it hidden. (1) Prisma 7's `prisma-client` generator emits **TypeScript into the source tree**, so `src/generated/` is gitignored and excluded from ESLint and Prettier. (2) `importFileExtension = ""` is required: the default `.ts` extensions break `moduleResolution: node`, and `.js` compiles but breaks ts-node and jest at runtime. (3) Prisma 7 mandates a driver adapter, adding `@prisma/adapter-pg`, `pg`, `@types/pg` and `dotenv` — approved separately. (4) Trigger errors changed shape; see **ERR-001**, the one finding that would have silently broken money correctness. (5) `nestjs-zod` v5 replaced `patchNestJsSwagger` with `cleanupOpenApiDoc`. (6) `zod` was moved to v4 while `api-contracts` held only primitives, so the migration cost was near zero. (7) `LedgerEntry.update` now refuses to edit an entry whose `sourceType` is not `MANUAL` — system-generated entries belong to the flow that created them (ADR-006).
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` is green (15/15). The migration was verified against a genuinely empty database — schema dropped and re-deployed from zero — with both triggers confirmed present afterwards. Tests: 14 unit (`MatchingEngine`, ported unchanged) and 8 e2e covering the allocation-sum constraint against real Postgres, including cumulative overflow, revoke-then-reallocate, direction mismatch, idempotency replay, and over-precise Decimal rejection. **Three things Phase 2 must handle:** the `Allocation` create/revoke endpoints are currently **unguarded** — ADR-011 restricts them to `ADMIN`/`OWNER`, and `RoleGuard` lands in Phase 2, so this is an open hole until then; `LedgerEntry` reads/writes are likewise unscoped and need `BranchScopeGuard`; and `Branch` already exists, so `User.branchId`'s foreign key has something to point at. One bug of my own worth remembering: the `FOR UPDATE` raw query must **not** cast `id` to `::uuid` — the column is TEXT, and the cast made every allocation request a 500 until fixed.

### TASK-002 — Phase 0: monorepo scaffolding

- **Date:** 2026-08-14
- **Module / Phase:** Phase 0 — monorepo scaffolding (no domain code)
- **Objective:** Stand up the pnpm + Turborepo workspace exactly as System Design §2 specifies, with both apps booting, the shared quality gate green, and the three-container dev topology from §10 running.
- **Relevant docs:** System Design §2 (workspace layout), §9 (stack), §10 (deployment topology); Playbook §2 (turbo task graph), §5 (Decimal), §13 (pre-commit rules); ADR-002, ADR-010; DESIGN.md (tokens).
- **What was done:** Root workspace (`pnpm-workspace.yaml`, `turbo.json` with the `lint`/`typecheck`/`test`/`build`/`dev` graph, `.gitignore`, shared `prettier.config.mjs`). `packages/config` built first, exporting ESLint presets (base/nest/next/package), the Prettier config, and TypeScript presets (base/nest/next/library) — base carries Kasync's rules including `no-explicit-any: error` per AGENTS.md. `apps/api` scaffolded with the NestJS CLI, `apps/web` with `create-next-app` (Next 16, App Router, Tailwind v4), both rewired onto the shared presets and stripped of the CLIs' single-repo cruft. `packages/api-contracts` created with Zod plus the decimal-string primitives from Playbook §5 (money `Decimal(18,2)`, quantity `Decimal(18,4)` per ADR-012). `packages/ui` created with DESIGN.md's tokens as Tailwind v4 theme variables, the `cn` helper, shadcn/ui wired in monorepo mode, and one `Button` added to prove the path. `docker-compose.yml` with `web`/`api`/`postgres` plus per-app dev Dockerfiles. `.env.example` for both apps.
- **Decisions made during this task:** (1) TypeScript presets deliberately omit `outDir`/`rootDir` — relative paths in an extended tsconfig resolve against the *preset's* directory, not the consumer's, so each package declares its own; this cost one failed build before being understood. (2) `apps/web`'s ESLint composes Next's own flat configs first and then only shared *overrides* from `packages/config`, rather than the full base — Next's config already registers typescript-eslint and registering it twice collides; it is also version-locked to the Next release, so it stays a dependency of the app. (3) Postgres is published on host port **5433**, because a native PostgreSQL already holds 5432 on this machine; the compose-internal port is unchanged, so only host tools are affected. (4) `web` runs on port 3001 to leave 3000 to `api`, matching the port Kasync's CORS defaults already expect. (5) The root `format` script excludes `docs/**` — running Prettier across markdown reformatted every standing doc (335 lines of pure churn) and buried the real diff. (6) Dev Dockerfiles install dependencies at **build** time rather than on container start; the first version installed on start, which re-downloaded the whole tree on every `up`. (7) Each image installs only its own subtree (`--filter api...` / `--filter web...`) and mounts a BuildKit cache for the pnpm store, so a dropped download resumes rather than restarting — the container's link to the npm registry on this machine is materially slower and flakier than the host's, and three build attempts died on it before `--fetch-timeout 600000` fixed it — pnpm's 60s default cannot pull the `next` tarball over this link. (8) Every `node_modules` directory is a named volume and the volumes are **per service**, not shared. A shared `/repo/node_modules` volume is seeded from whichever container is created first, so `web` inherited `api`'s filtered install and crashed on a missing `next`. Named volumes only seed on first creation, so changing an image's dependencies means removing its volumes, not just rebuilding.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` is green across all 5 packages (15/15 tasks). `docker compose up -d` brings up all three containers with `api` answering 200 on `/api/v1`, `web` answering 200 and rendering the shared component, and `postgres` 16.14 healthy on host port 5433. Both apps also boot together under `pnpm dev` — `api` answers 200 at `http://localhost:3000/api/v1`, `web` serves 200 at `http://localhost:3001` rendering the shared `Button`. Cross-workspace imports are proven, not assumed: `@ohmypos/api-contracts` resolves and typechecks from `apps/api`, and its scale enforcement was exercised (2dp money accepted, 3dp rejected, 4dp quantity accepted, negatives rejected). Three things Phase 1 needs to know: **Prisma is deliberately not installed yet** — it arrives with the ported schema, and `apps/api/Dockerfile.dev` already installs `openssl` so no image rebuild is needed for it; the **`radix-ui` package was pulled in automatically** by `shadcn add button`, so it entered `packages/ui` without passing the dependency-approval gate explicitly — worth a look; and `apps/api/src/main.ts` currently sets only the `/api/v1` global prefix — CORS, cookie-parser, the global Zod pipe, Swagger, pino logging and graceful shutdown all still need porting from Kasync's `main.ts` in Phase 1.

### TASK-001 — Documentation correction pass against Kasync's literal schema

- **Date:** 2026-08-14
- **Module / Phase:** Pre-implementation (before Phase 0 scaffolding)
- **Objective:** Before writing any code for Phase 0–2, read all six standing docs plus Kasync's actual source, and resolve the open item ERD v2 §7 raised — that its ported-entity definitions were written from Kasync's documentation rather than its literal `schema.prisma`.
- **Relevant docs:** ERD v2 §7 (the open item), ADR-011, ADR-012 (written by this task), System Design §4, Playbook §17 (ADR trigger criteria).
- **What was done:** Read `../kasync/prisma/schema.prisma`, all five files under `../kasync/prisma/migrations/`, and the `allocation`, `matching`, `ledger-entries`, `accounts`, `categories`, `branches`, `auth`, `users` modules plus `common/` infrastructure. Compared field-by-field against ERD v2. Then: added **ADR-012** (ported tables take Kasync's literal schema as baseline); rewrote **ERD §2** ported entities and enums, added `User.isActive`, added Decimal precision + inherited constraints to §6, and replaced §7's open item with seven concrete porting notes; added `Import` and `Reconciliation` to **System Design §4** and reclassified `Auth`/`Users` as "Ported pattern, re-implemented"; added precision rules and `InvalidRoleBranchAssignmentException` to **Playbook §5/§6**; fixed the **Handbook §10** row that wrongly flagged `ADMIN` reconciliation as a bug, plus §5/§7/§8; added `Import` to **PRD §7**; bumped stale `Depends on` headers across all docs, `AGENTS.md`, and `README.md`. No code was written.
- **Decisions made during this task:** Three, all confirmed with the user before editing and recorded in ADR-012 — (1) keep Kasync's shared `TransactionType {INFLOW, OUTFLOW}` rather than renaming to `INCOME`/`EXPENSE`, because `AllocationService` and `MatchingEngine` compare the two types directly; (2) when ERD v2 and Kasync's schema conflict on a ported table, Kasync wins and the ERD is corrected; (3) apply corrections in-place with version bumps rather than as a separate addendum. `User.isActive` was chosen over a `deactivatedAt` timestamp to match the existing `Product.isActive` convention in ERD §3.
- **Status:** Done
- **Handoff notes:** Phase 0 (monorepo scaffolding) has a plan awaiting approval and has **not** started — no files exist under `apps/` or `packages/` yet. The three biggest things Phase 1 now needs to know are all in ERD §7: stripping Kasync's multi-tenant `userId` makes porting an adaptation rather than a copy (it touches every method of every ported service, and Kasync's own tests assert on that scoping, so they need rewriting); Kasync's self-registration and self-delete endpoints must not be ported; and the SQL triggers should be copied from the `20260809180000_multi_tenancy_and_triggers` migration, not the `init` one, because the later version has a corrected enum cast. One consequence worth planning for early: `LedgerEntry.categoryId` stays required, so the seed must create system categories before any `Sale` or `PayableSettlement` can generate its ledger entry.

_(Add the next entry above this line, following the template.)_