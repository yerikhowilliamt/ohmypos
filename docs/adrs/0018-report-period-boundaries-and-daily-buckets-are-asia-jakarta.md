# ADR-018: Report period boundaries and daily buckets are Asia/Jakarta; storage stays UTC

**Status:** Accepted. Extended by ADR-023 (2026-08-22) — inventory's month boundary now delegates to this ADR's `common/period.ts` instead of defining its own UTC boundary.

**Context:** Dashboard 3's five reports are filtered by date range, and one of them buckets income by day. Every timestamp in this repository is stored as a UTC instant in a `TIMESTAMP(3)` column without time zone and serialized with `toISOString()`. Nothing had ever needed to convert a stored instant into a *calendar day*, so the repo had no convention for it.

The business runs in WIB (UTC+7). Under UTC bucketing, the day boundary falls at **07:00 WIB** — inside opening hours for an F&B business — so every morning's first sales are attributed to the previous day. There is no worse place to put a day boundary than the middle of the first service hour.

The Phase 6 plan raised this same question for the Inventory Summary's month boundaries, leaned UTC for consistency with storage, and explicitly deferred the decision to Phase 7 with the instruction that it be answered once, globally. Phase 6 has not been implemented, so Phase 7 answers it first.

**Decision:**

1. **Report ranges are two INCLUSIVE `YYYY-MM-DD` calendar dates in `Asia/Jakarta`**, resolved server-side to a half-open UTC instant range: `from = startDate T00:00+07:00`, `to = (endDate + 1 day) T00:00+07:00`, exclusive.
2. **Daily buckets are WIB calendar days**, produced in SQL as `to_char(((entry_date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD')`. Both conversions are required: the column is naive-UTC, so a single conversion would interpret the stored value as already being WIB and shift it the wrong way by seven hours.
3. **Storage is unchanged.** `soldAt`, `entryDate`, `movementDate` remain UTC instants, serialized with `toISOString()`. Only report boundaries and buckets are WIB.
4. **The rule lives in exactly one file** — `apps/api/src/common/period.ts`, exporting `REPORT_TIMEZONE`, `resolveReportRange` and `eachWibDay`. It is in `common/`, not in the reports module, because Phase 6 must import it rather than defining a second month resolver.
5. **The timezone is a constant, not a parameter.** Not per-request (two users comparing screens would get different numbers with nothing on the page explaining why) and not an environment variable (a report's meaning must not depend on deployment config).
6. **A range is rejected with a 400** (`InvalidReportRangeException`) when the end precedes the start, a date is malformed or unreal, or the span exceeds 366 days. A future range is allowed and returns zeros.

**Consequences:**

- (+) "How much did we take on the 16th" means the WIB 16th, which is what the owner means.
- (+) WIB is a fixed UTC+7 offset with no DST, so there are no ambiguous or skipped local times and `dayCount` arithmetic is exact.
- (+) One definition for the whole repo: Dashboard 3 and Dashboard 5 cannot disagree at a boundary.
- (−) The daily-income bucket and the stored `entryDate` of the same row can name different calendar days (a 05:00 WIB sale is stored as the previous UTC day). Anyone reconciling a report row against a raw ledger row by eye must know this.
- (−) The Phase 6 inventory plan's decision 9 leaned UTC and must be corrected before Phase 6 is executed, or Dashboard 5 will contradict this ADR.
- (−) The 366-day cap makes a multi-year trend a client-side concern (several requests), not a single call.

**Alternatives considered:**

- *UTC boundaries everywhere, matching storage*: rejected — consistent with the database and wrong for the business, with the boundary landing inside opening hours. Consistency with a storage detail is not worth a daily report the owner cannot reconcile against their own till.
- *Timezone as a request parameter*: rejected — makes the same report mean different things to different callers with no indication on the page.
- *Timezone as an environment variable*: rejected — a report's semantics must not be a deployment concern.
- *Converting at the frontend*: rejected — the bucketing happens inside a SQL `GROUP BY`; the server would have to return raw rows for the client to re-aggregate, which defeats the aggregation.
