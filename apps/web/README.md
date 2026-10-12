# apps/web

**Related:** System Design §5 · ADR-002, ADR-004, ADR-010, ADR-011, ADR-013, ADR-015, ADR-018, ADR-019, ADR-025 · [`docs/design.md`](../../docs/design.md) · Playbook §5, §19

This is the Next.js frontend for the POS, back office and platform console. It talks to `apps/api` over REST only, never to the database (ADR-002). Request and response shapes come from `@ohmypos/api-contracts`. Before touching Next-specific APIs, read [`AGENTS.md`](AGENTS.md) in this folder: this Next version differs from older conventions.

## Routes and access

| Route group | Roles (`requireRole`) | Notes |
|---|---|---|
| `(pos)` | `KASIR`, `OWNER` | POS (`/sales`) and sales history. A `KASIR` sells at their own branch; an `OWNER` picks one, and the system branch is never offered (ADR-014) |
| `(back-office)` | `ADMIN`, `OWNER` | Pages narrow further: `ADMIN` gets master data and reconciliation only (System Design §5, a deliberate v1 boundary). The only group with dark mode |
| `(shared)` | all three | Profile, help |
| `platform/(console)` | platform admin (`requirePlatformAdmin`) | A route group under a literal `platform/` segment, so URLs keep the `/platform` prefix that `proxy.ts` gates on |
| `platform/login`, `login` | public | `platform/login` lives outside `(console)` so the console layout cannot redirect it into a loop |

`app/page.tsx` sends each role to its landing page: `KASIR` → POS, `OWNER` → Dashboard, `ADMIN` → Data Master.

**All frontend gating is UX only.** `RoleGuard` / `BranchScopeGuard` / `PlatformAuthGuard` in `apps/api` are the authority (see `apps/api/src/common/README.md`):

1. `proxy.ts` redirects before render when the session cookie is missing. It cannot verify the JWT. `/platform/**` uses its own cookie and is checked first, so a platform-only session is not bounced to `/login` and a tenant session does not pass the console door.
2. Route-group layouts call `requireRole` / `requirePlatformAdmin`, which ask the API who the caller is (`lib/session.ts`, `lib/platform-session.ts`). The two lookups stay separate on purpose: a platform admin is not a `User`, and "no tenant" must never quietly mean "every tenant".
3. `lib/nav-config.ts` shows each role only the links it can reach. The platform console has its own nav, because a platform admin is not a `UserRole` (ADR-025 Decision 5).

## Talking to the API

| Piece | Role |
|---|---|
| `lib/api-url.ts` | The browser always calls the Next origin, so auth cookies belong to the web host and are visible to `proxy.ts` and Server Components. Only the Next server calls the backend origin |
| `app/api/v1/[...path]` + `lib/api-proxy.ts` | Same-origin BFF passthrough. Bodies stay streams, so multipart boundaries and error payloads pass unchanged |
| `lib/api.ts` (`apiFetch`) | The client. Sends the HttpOnly cookies (JS never reads a token) and an `x-correlation-id`, so a reported error maps to a server log line |

`apiFetch` behavior:

- **401 → one silent refresh, then one retry.** The refresh endpoint depends on the path (`/auth/refresh` for tenant paths, `/platform/auth/refresh` for `/platform/*`). A platform 401 refreshed on the tenant endpoint would send the operator to the shop's `/login`. Refreshes are **deduplicated per audience**, because refresh tokens rotate and two parallel refreshes would invalidate each other. A 401 from a login endpoint means bad credentials and is not refreshed. A failed refresh does a full reload.
- **`ApiError`** carries `status` and the parsed `body`. Structured errors such as the stock shortfall 409 are read from `body`.
- **Indonesian messages:** offline or unreachable errors replace the browser's English "Failed to fetch". Validation errors show the per-field messages, not "Validation failed". A gateway page with no message gets a generic Indonesian fallback.
- **FormData** bodies get no explicit `Content-Type`, so the browser can add the multipart boundary.

## Data fetching conventions (TanStack Query)

- **Hooks per area** in `hooks/` (`usePos`, `useExpenses`, `useReconciliation`, …) build their query string with a shared `build…Query` helper. **Export uses the same helper**, through a one-page fetcher outside React Query plus `lib/fetchAllPages.ts`, so the exported set never drifts from what is on screen (DEBT-048).
- **Server-side search, sort and pagination** for large lists: `DataTable` with `serverSearch`, `sorting`/`onSortingChange` and `pagination`. A client-side filter or sort over one page would look like it covers the whole set while covering 10 rows. Only the backend's real sort keys get sortable headers. On a keystroke, reset to page 1 before the debounce (`useDebouncedValue`) so an out-of-range page is never requested. Keep the previous page visible while the next loads.
- **Lookups must be complete.** When a screen resolves data against a list (for example, the match queue resolving candidate amounts), fetch every page (TASK-068). Truncation there makes the screen wrong, not merely shorter.
- **Calendar views** (attendance matrix, leave overlay) request one month per page. If a month exceeds the page, they **say so on screen**, because a blank cell reads as "absent" or "worked", not "not loaded" (ERR-047).
- **Invalidation:** money writes invalidate everything they can change. Reconciliation statuses are trigger-derived, so they are refetched, never predicted. Password resets invalidate nothing, because nothing displayed changes.

### Export (`lib/export.ts`, `lib/fetchAllPages.ts`)

- `exceljs` is loaded on first click only. Workbook building is separate from downloading, for tests.
- `fetchAllPages` always pages at 100 and stops at `EXPORT_ROW_CAP` (5,000 rows = 50 requests, half the per-minute throttle). **Exceeding the cap is an error**, never a silent partial export. `totalPages` is read from page 1.
- Filenames carry the **data's date range** (DEBT-025), or today's **local** date when there is none. Two exports of different ranges on the same day must not overwrite each other, and `toISOString()` would name early-morning WIB exports after yesterday.

## Money and dates on the client

- **Never `Number` arithmetic for money or quantities** (Playbook §5). `lib/decimal.ts` is a scaled-BigInt `Fixed` type (`{ units: 1250n, scale: 2 }` is 12.50) with exact multiply, explicit `roundHalfUp`, floor division and preview division. Parsing truncates extra digits rather than rounding them, which surfaces raw input instead of hiding it.
- **Two rounding rules, mirrored from the server.** Cart totals round per line, then sum (`lib/pos/cart-totals.ts`). Stock fan-out sums exactly, then rounds once per material (`lib/pos/availability.ts`). Swapping them is the drift ADR-015 warns about.
- **Display versus form values** (`lib/formatters.ts`): `formatQuantity` renders id-ID (`5.000`), which the API would read back as five, so **never seed an editable field with it**. Use the locale-free trim instead.
- **Dates:** build `YYYY-MM-DD` from local date parts; `toISOString()` reads UTC and shifts a day in WIB (ADR-018). The POS operating day is shown in WIB regardless of the device timezone.
- `CurrencyInput` (`packages/ui`) handles Indonesian formatting; see `packages/ui/README.md`.

## POS (`components/pos`, `lib/pos`)

| File | Role |
|---|---|
| `cart.reducer.ts` | Pure cart state machine (no React, network or dates), exhaustively tested |
| `availability.ts` | Cart-aware makeable quantity |
| `product-filters.ts` | Availability filter buckets |
| `cart-totals.ts` | Totals by the server's rule |
| `to-create-sale.ts` | Builds the `POST /sales` body and validates it with `CreateSaleSchema`, so drift surfaces in the client, not as a 400 |
| `submit-error.ts` | Maps a failed submit to in-cart feedback |

**Cart rules (`cart.reducer.ts`):**

- At most 50 lines, matching the API.
- Tapping a product merges into an existing line **only if that line is at master price**. An overridden line is a deliberate discount, so another tap starts a new line (the API allows duplicate products for this).
- The **unit price field is the per-line override**, the only discount mechanism (ADR-015). `null` means master price, and `unitPrice` is then **omitted** from the request, not sent as null. Clearing the field clears the override rather than charging 0.
- Quantity stays > 0. The stepper's minus is disabled at 1, so removal goes through the row's delete icon.
- **Submit lifecycle:** `SUBMIT_START` is a no-op while a sale is in flight (the double-tap guard lives in the reducer, not the button). **Only success clears the cart**; every failure keeps lines, quantities and overrides intact for a one-tap retry. Any edit clears a previous error. An **uncertain** result (network failure or 5xx) must be confirmed before the cart is usable again.
- `soldAt` is taken at submit, because the API rejects a `soldAt` more than 5 minutes ahead and a cart can sit open longer.
- Each sale carries an **idempotency key** (`saleIdempotencyKey`), rotated after a successful sale, so re-sending the same cart is safe. **Known issue:** the "Periksa transaksi terakhir" check sends no `branchId` and returns 403 for a `KASIR` (DEBT-080).

**Availability (ADR-013):** `makeableQuantity` from the API is computed per product in isolation, so two products sharing a material report numbers that are not jointly satisfiable. `availability.ts` subtracts what the rest of the cart already claims. **It is advisory, never authoritative or reserved**: stock is one pool other branches drain concurrently, and the real check is the row-locked sufficiency test at sale time. An unknown material counts as zero stock (fail closed, as on the server).

- A tile offers "add" strictly on recipe and active status (the server rejects those outright) and leniently on headroom.
- Filter buckets (`ALL`, ready, low or out, no recipe) are exhaustive and exclusive, so the counts add up. They are by availability because `Product` has no category (DEBT-018).
- `GET /products` is unpaginated master data, so POS search and filters run client-side.

**Errors (`submit-error.ts`):** never a toast. A failure becomes a `CartError` in Indonesian, shown beside the lines it names. Stock shortfalls are per raw material and are mapped to cart lines through each product's recipe. The problem-line highlight combines the client's own advisory over-commit with the server's 409 verdict. The server's verdict is authoritative and often names lines the client thought were fine, because another till drained the pool first. Other 409s (inactive product, no recipe) mean the product cache is stale and it is invalidated.

**Layout:** three zones (design.md §11.1). On mobile, the order panel becomes a bottom sheet that wraps the **same** `CartPanel` instance. There is no customer picker and no service tax (no Customer model; ADR-015, DEBT-004). The payment method (an `Account`) is a visible tile grid, not a dropdown. `SaleSuccessDialog` renders the receipt from the 201 response only, because a `KASIR` cannot `GET /sales/:id`.

## Reconciliation UI (`components/reconciliation`, `lib/reconciliation`, `hooks/useReconciliation.ts`)

Backend rules are in `apps/api/src/modules/reconciliation/README.md`.

- **Propose is a mutation, never a query.** It writes statuses (UNRESOLVED → PENDING_REVIEW), so it runs only when the button is clicked, never on mount or refocus. Candidates are not persisted: a reload empties the queue, and re-proposing will not pick up rows already in PENDING_REVIEW. "Reset Status Pencocokan" is the way back.
- **Accepting a candidate** (`match-candidates.ts`): each transaction is allocated its **full amount**, which is correct because proposals only come from UNRESOLVED (nothing allocated) transactions. Amounts are looked up from the PENDING_REVIEW list, fetched completely. A missing transaction, or a sum that disagrees with the engine's total, is **refused, never guessed**.
- **"Abaikan"** rejects every transaction of a candidate (aggregation candidates have several). The candidate leaves the queue only if all calls succeed.
- **Split allocation** (`allocation-draft.ts`, `SplitAllocationDialog`): the running total is the committed ACTIVE allocations from the server plus local draft lines. Submit is blocked while over-allocated. The cap is a **strict `>`**, because allocating exactly the full amount is the success case that makes the transaction MATCHED. REVOKED allocations do not count. Two lines for the same ledger entry is a UI-only error. **Each edit rotates a line's idempotency key**: the server returns an existing allocation for a known key, so an edited line resent under its old key would silently keep the old amount. The batch is committed in one server transaction, so a rejected line rolls back the whole split. The server's error is shown verbatim and remains the authority.
- **Ledger entry picker:** same type only (a direction mismatch is a guaranteed 400), within ±30 days of the transaction (ADR-019; wider than auto-matching's 3 days), **every page** (the API sorts newest first, so truncation would drop the nearest older entries), then sorted nearest-date-first client-side.
- **`search` and sort are never sent to the summary.** Search only matches bank descriptions and would skew `variance`; sort has no effect and would cause pointless refetches.

## Platform console and impersonation (ADR-025)

- `PlatformShell` is separate from `AppShell`. `AppShell` is built around a tenant `UserResponse` (role, branch, profile), so reuse would have meant faking one or widening shared tenant components. It composes the same `packages/ui` primitives instead.
- **Impersonation:** the API returns the token in the response body. `app/api/platform/impersonation/route.ts` installs it as the HttpOnly `access_token` cookie server-side (POST) and clears it (DELETE). It validates nothing; the API does. A second, **non-HttpOnly marker cookie** only tells the tenant shell to show `ImpersonationBanner`. The marker is forgeable by design, because read-only is enforced by the API on the signed `imp` claim, and decoding the JWT here would mean shipping the signing secret to the web app.
- The banner is **permanent and undismissable**: the risk is not a destructive click (the API refuses writes) but an operator forgetting whose numbers are on screen. "Keluar" discards the cookies and returns to the console; it cannot revoke the token, which stays valid until its 30 minutes run out.
- **Suspended tenant** (TASK-132): `AppShell` renders the chrome and `SuspendedTenantDialog`, but not the page, whose components would only fire 403s. The dialog cannot be dismissed (no X, Escape or outside click), because nothing behind it works and logout is the one action left. While impersonating, the dialog is not shown, since investigating a suspension is the point.
- Owner recovery dialogs (reset password, correct email) state what will happen, require a reason, and clear the typed password as soon as it is sent. They are keyed on open, so each opening is a fresh mount.

## Other screens worth knowing

- **Dashboard trend** uses a rolling `TREND_WINDOW_DAYS` window, not month-to-date. On the 1st of a month, month-to-date is one point, and a one-point line renders as an empty panel (ERR-051). `ReportLineChart` also draws dots for single-point series.
- **Stock movements** show `movementDate` (stock-takes are dated to the period start), and a `null` branch renders as "Pusat" (a central event). There is no running-balance column: it is undefined under paging, sorting and filtering.
- **"Umum" vs "Semua Cabang"** (`ScopeHint`): `Umum` is the system branch (charged to no single branch), while "Semua Cabang" means no filter and already includes Umum. Owners read them as synonyms, so a one-line hint sits next to the filter.
- **Users:** "Hapus" soft-deactivates (`Sale.userId` is an audit trail). The staff email field suggests `<firstname>@<owner's domain>` until the Owner edits it (`lib/staff-email.ts`); it is never enforced.
- **Help** (`lib/help-content.ts`) is a typed array, not MDX. A coverage test requires every nav route to be documented. Status words come from `lib/vocabulary.ts`, and screen or button names are quoted verbatim, so grep there when renaming a label.

## Testing

Unit and component tests use Vitest (`*.test.ts(x)` next to the code). E2E uses Playwright (`e2e/`). Run `turbo run lint typecheck test --filter=web`.
