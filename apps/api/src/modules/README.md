# API Modules

This is the catalog of every backend module. Larger modules have their own `README.md`; small ones are documented in full here. Shared infrastructure (guards, tenant isolation, errors, periods) is in [`../common/README.md`](../common/README.md). The rules for code comments versus docs are in Engineering Playbook §19.

## Catalog

| Module | Purpose | Docs |
|---|---|---|
| `auth` | Tenant login sessions, self-service profile | [README](auth/README.md) |
| `users` | Staff administration (`OWNER` only) | [README](users/README.md) |
| `platform` | Platform operator console: tenants, impersonation, owner recovery | [README](platform/README.md) |
| `sales` | POS sales and voids | [README](sales/README.md) |
| `supplier-purchases` | Purchases, latest-cost write-back | [README](supplier-purchases/README.md) |
| `payables` | Utang and settlements | [README](payables/README.md) |
| `stock-movements` | Sole writer of `currentStock`, lock ordering | [README](stock-movements/README.md) |
| `inventory` | Opening stock (stock-take), inventory summary | [README](inventory/README.md) |
| `products`, `recipes` | Products, recipes, HPP | [README](products/README.md) |
| `raw-materials` | Raw materials, units, cost | [README](raw-materials/README.md) |
| `ledger-entries` | Cash ledger | [README](ledger-entries/README.md) |
| `import` | Bank statement CSV/PDF parsing | [README](import/README.md) |
| `reconciliation`, `matching`, `allocation` | Bank ↔ ledger reconciliation | [README](reconciliation/README.md) |
| `reports` | Dashboard 3 financial reports | [README](reports/README.md) |
| `branches` | Outlets, main store, system branch | below |
| `devices` | POS terminal registry, attendance | below |
| `leave-requests` | Leave (cuti) | below |
| `accounts` | Cash/bank/e-wallet accounts | below |
| `suppliers`, `categories`, `business-profile` | Simple master data | below |
| `health`, `metrics` | Operations | below |

Every module that was ported from Kasync dropped Kasync's multi-tenant `userId` parameter (ERD §7); tenancy now comes from `common/prisma` (ADR-025).

## Branches

| Endpoint | Roles |
|---|---|
| `POST`, `GET`, `PATCH /:id`, `DELETE /:id` | `OWNER`, `ADMIN` |
| `PATCH /branches/:id/main-store` | `OWNER` |

- **Main store.** A tenant's first branch becomes the main store automatically. Counting and inserting share one transaction so two concurrent creates cannot both see zero, and the partial unique index `branches_single_main_store` is the backstop. Moving the flag is release plus reassign **in one transaction**: between the two writes the index is satisfied by zero rows, so a crash in between would leave no main store.
- **Delete order:** a branch with staff is refused first (the more actionable message). The main store may be deleted only if it is the last branch: a fresh install correcting a typo is legitimate, while a business with stores and no main store is not.
- **System branch (ADR-014)** cannot be edited or deleted through this API, and is never creatable from a request; only `ensureSystemRefs` creates it. Deleting it would break every central purchase. See `common/README.md`.
- `PATCH /:id/main-store` is declared before `PATCH /:id`, so the bare route cannot swallow it.

## Devices and attendance (ADR-021)

All routes are **`OWNER` only**, including activation.

| Endpoint | Effect |
|---|---|
| `POST /devices`, `GET /devices`, `PATCH /devices/:id`, `DELETE /devices/:id` | Terminal registry. Creating a device issues a one-time **activation code** with a short TTL |
| `POST /devices/activate` | **The ceremony:** an authenticated `OWNER`, physically at the terminal, redeems the code; the response sets the signed `ohmypos_device` cookie on that browser and clears the code |
| `PATCH /devices/:id/deactivate` | Revoke a lost or compromised terminal; later logins from it fail the check |
| `GET /devices/attendance`, `PATCH /devices/attendance/:id` | Attendance log; override validity |

- An earlier plan sketched activation as `@Public()`. That would defeat the "physical Owner ceremony" premise, so activation requires an `OWNER` session.
- **Attendance is recorded on every `KASIR` login** (`AuthService.login` decides the role), with `isValid` and a `violationReason` (for example `NO_DEVICE_COOKIE`). It is **informational only and never blocks login**.
- **A device with logins cannot be deleted** (`DeviceHasAttendanceHistoryException`). `AttendanceRecord.device` is `onDelete: SetNull`, so a delete would blank `deviceId` on every past login, and the log renders a blank as "Perangkat Luar", the same as an unregistered device. Months of legitimate attendance would turn into violations. Deactivate instead; a never-used device can be deleted.
- **An active device cannot move to another branch** (`DeviceBranchLockedException`): deactivate, change the branch, then activate again from the terminal. Only a real move is rejected, because the edit form resubmits the same `branchId`.
- An unknown or used code returns 404 `InvalidActivationCodeException`; an expired one returns 400 `ActivationCodeExpiredException`.
- Attendance list filters on `loginAt` (what the calendar matrix reads), not `createdAt`. Search and branch filters are combined as an `AND` of `OR` groups, because two `OR` keys on one object would overwrite each other and silently drop branch scoping. Email is searchable (DEBT-052). The `branchName` sort uses the **user's** branch, which is the column rendered; the device's branch is used only by the `branchId` filter.
- Bare `:id` routes are declared last so they cannot shadow `attendance/:id`, `activate`, `:id/deactivate`.

## Leave requests (ADR-021)

| Endpoint | Roles |
|---|---|
| `POST /leave-requests`, `GET /leave-requests/me` | any authenticated |
| `GET /leave-requests`, `PATCH /:id/approve`, `PATCH /:id/reject` | `OWNER` |

A month filter matches by **overlap**, not containment: leave running 28 Feb to 3 Mar appears in both months.

## Accounts

`OWNER`/`ADMIN`, except `GET /accounts/payment-methods`, which `KASIR` may call because the POS needs an `accountId` for a sale. That route uses a Prisma `select` so **`openingBalance` (Kas Awal) is never returned to a cashier**, even if the route's roles are widened later. It is declared before `GET /accounts/:id`, otherwise `payment-methods` would hit `ParseUUIDPipe` and return 400.

## Suppliers, categories, business profile

| Module | Writes | Reads | Notes |
|---|---|---|---|
| `suppliers` | `OWNER`, `ADMIN` | any authenticated (a `KASIR` picks a supplier on a purchase) | Unique name (`SupplierNameTakenException` on P2002); delete refused when referenced by a purchase or payable (`SupplierInUseException` on P2003) |
| `categories` | `OWNER`, `ADMIN` | `OWNER`, `ADMIN` | The two system categories are protected (see `common/README.md`) |
| `business-profile` | `OWNER` (`PATCH`, `POST /logo`) | any authenticated | One profile per tenant |

## Health and metrics

- `GET /health`: `@Public()`, a `@nestjs/terminus` check that pings the database.
- `GET /metrics`: Prometheus, **`OWNER` only**, since business metrics are not public. It exposes default process metrics plus three business metrics worth alerting on: sale throughput (`saleCreatedTotal`), sale latency (`saleDurationSeconds`), and the ADR-007 stock-conflict rate (`stockConflictTotal`, 409s under the row lock, never 500s).
