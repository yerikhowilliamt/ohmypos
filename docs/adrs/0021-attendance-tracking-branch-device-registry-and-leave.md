# ADR-021: Attendance Tracking, Branch Device Registry, and Leave Requests (Expanding Beyond PRD §3/§10 Non-Goals)

**Status:** Accepted (Expands PRD §3 & §10 Non-Goals)

**Context:**
PRD §3 and §10 originally established "Employee shift/payroll management" as an explicit non-goal. However, store operations require basic attendance monitoring (tracking when a cashier logs in and detecting whether the login occurred on an authorized store tablet or an unauthorized personal phone) and leave request management (allowing employees to submit leave requests and owners to approve/reject them).

**Decision:**
1. **Attendance & Device Registry (Phase 11):**
   - **Device Scoping:** `Device` is scoped to `Branch`, not `User` (a branch shares 1–3 physical tablets among assigned cashiers).
   - **Role Scoping:** Attendance tracking is strictly enforced for `KASIR` logins. `ADMIN` and `OWNER` are not branch-bound and are excluded from attendance tracking (`attendance: null`).
   - **Identification Mechanism:** A long-lived, HttpOnly, first-party signed cookie (`ohmypos_device = <deviceId>.<hmac>`) signed using Node's built-in `crypto` HMAC-SHA256. Activated physically by an authenticated `OWNER` at the terminal (`POST /devices/activate`).
   - **Login UX:** Login always succeeds for valid active accounts. Unregistered or mismatched devices record an `AttendanceRecord` with `isValid: false` and a `violationReason`, showing a non-blocking warning banner to the cashier rather than locking them out of the POS.
   - **Accepted Residual Risk (v1):** A cashier with dev tools access to a physical tablet could extract and copy the device cookie to a personal device. Accepted for v1 as low risk in typical retail operations.
2. **Leave Requests (Phase 12):**
   - Employees (`KASIR`) submit `LeaveRequest` records; approval/rejection authority is strictly `OWNER`-only (consistent with ADR-011 user governance).
   - Routed under `(shared)/leave-requests` so both roles can access their respective views without widening back-office RBAC.

**Consequences:**
- (+) Satisfies operational compliance without building full complex shift/payroll systems.
- (+) Zero new npm dependencies for device signing (Node native `crypto`).
- (+) POS logins are never blocked during store rush hours even if a terminal cookie is cleared.
- (−) Adds two tables (`devices`, `attendance_records`) and one enum (`AttendanceViolationReason`) in Phase 11.
- (−) Device cookie cloning via dev tools is possible; accepted as v1 trade-off.

**Alternatives considered:**
- *Browser Canvas/Hardware Fingerprinting*: rejected — fragile across browser/driver updates, causing false violations on legitimate tablets.
- *IP Subnet / User-Agent matching*: rejected as primary validator — personal phones on store Wi-Fi share the same public IP as the store tablet.
- *Public/Unauthenticated Device Activation Endpoint*: rejected — introduces brute-force risk; activation must be an authenticated Owner ceremony directly on the terminal browser.
- *Blocking Login on Invalid Device*: rejected — risking POS downtime during peak operational hours over an informational monitoring check.
