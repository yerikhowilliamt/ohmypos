# Import

**Owner module for:** bank statement import into `BankTransaction`
**Related:** PRD §5.7 · ADR-010, ADR-022 (Mandiri PDF), ADR-026 (BCA PDF) · ERD §6, §7 · Playbook §5, §9 · AGENTS.md "Known Constraints"

## Overview

This module parses a bank statement file and bulk-inserts its rows as `BankTransaction`s for one `Account`. Reconciliation then matches them against `LedgerEntry` records. It was ported from Kasync with two changes: the multi-tenant `userId` scoping was removed (ERD §7), and class-validator row validation was dropped (ADR-010), because the parsers themselves reject malformed rows.

| Endpoint | Accepts | Notes |
|---|---|---|
| `POST /import/:accountId?format=…` | CSV | A PDF uploaded here is rejected by file signature. Otherwise it would import zero rows and look like an empty statement |
| `POST /import/pdf/:accountId?format=…&password=…` | PDF (max 5 MB) | A separate route, so the CSV contract stays unchanged and each route can reject the other's files |

Role restrictions are set at controller level (`RoleGuard`).

## Parsers

`BankParserFactory` picks a `BankParser` by `format` key. Every parser returns `ParsedTransaction[]` with a day-only `txnDate` (midnight UTC), a positive decimal-string `amount`, `type` (`INFLOW`/`OUTFLOW`), a `description` of at most 500 characters, and a `dedupHash`.

| `format` | Class | Source |
|---|---|---|
| `BCA` | `BcaCsvParser` | BCA CSV export |
| `MANDIRI` | `MandiriCsvParser` | Mandiri CSV export |
| `MANDIRI_PDF` | `MandiriPdfParser` | Mandiri Livin e-statement (ADR-022) |
| `BCA_PDF` | `BcaPdfParser` | BCA "Laporan Mutasi Rekening" (ADR-026) |

### Shared rules (all parsers)

- **Skip, don't guess.** A row that is malformed, undatable, has a bad amount or an unknown direction is dropped. A dropped row shows up as an unreconciled gap, whereas a wrongly parsed row silently corrupts the books.
- **Idempotent re-import.** `dedupHash = sha256(date, [time], description, amount, type)`. Byte-identical rows in one file get an occurrence suffix (`_1`, `_2`, …) so they stay distinct. **Nothing page-relative or statement-relative goes into the hash** (for example, Mandiri's `No` restarts at 1 in every statement), because the same transaction must hash the same way in an overlapping statement. `createMany({ skipDuplicates: true })` relies on the unique `(accountId, dedupHash)` and `(accountId, externalRef)` constraints, so re-importing a statement is a no-op.
- **`externalRef` is `null` for PDFs.** Reference numbers sit inside the description text with no column of their own, so there is nothing dependable to key on.
- **Logging:** only counts and the account id, never statement contents (Playbook §9).

## PDF parsing

`pdf-text.util.ts` extracts **positioned** text runs (`x`, `y` in PDF points, origin bottom-left, so **y grows upward**) with `pdfjs-dist` (legacy Node build).

- PDFs are detected by the `%PDF-` file signature, never by mimetype: browsers send `application/octet-stream` for both CSV and PDF.
- At most 100 pages. A 5 MB PDF can still hold thousands of pages, and parsing runs synchronously in the request thread.
- Password-protected, corrupt and non-PDF files each map to a distinct Indonesian 400 message.

Both parsers read the table **by column x-position, not by line regex**. Bank statements are tables, and regexing a line whose columns were joined by a heuristic is unreliable. **The two layouts differ completely, so never share code between them.** Before changing any constant, re-derive the geometry against a real sample.

### Mandiri (`mandiri-pdf.parser.ts`)

Verified against a real 6-page, 57-transaction statement: every row was extracted, and the running balance reconciles from opening to closing.

| Column | x-range (pt) | Notes |
|---|---|---|
| `No` | < 40 | Sequential row number at x≈20. **Row key** |
| Date / time | 40–120 | `01 Jul 2026` plus `HH:MM:SS` at x≈52 |
| Description | 120–370 | x≈124, multi-line |
| Nominal | 370–460 | Right-aligned, signed: `+1.099.500,00` / `-…` |
| Saldo | ≥ 460 | Ignored |

- **Fixed pitch:** rows are about 46pt apart and the tallest spans about 30pt. Each row claims the runs between the midpoints to its neighbours, capped at ±25pt (`MAX_ROW_HALF_HEIGHT`). That keeps the page header out of the first row, and drops page furniture and the disclaimer page without a blocklist.
- **Amounts** use Indonesian formatting: dots group thousands and the comma is the decimal point. Direction comes from the sign.
- **Dates** carry the year on every row. Month abbreviations appear in either Indonesian or English depending on locale (`Agu`/`Aug`, `Okt`/`Oct`, `Des`/`Dec`, `Mei`/`May`).
- **Time** is kept out of `txnDate` (day-only, like the CSV parsers and the matching engine) but folded into the hash to keep same-day rows distinct.

### BCA (`bca-pdf.parser.ts`)

Verified against a real 7-page, 63-transaction August statement: every row was extracted, and the parsed CR/DB totals match the statement's own `MUTASI CR` / `MUTASI DB` summary exactly.

| Column | x-range (pt) | Notes |
|---|---|---|
| Tanggal | 40–85 | `DD/MM` at x≈43, **no year**. **Row key** |
| Keterangan | 85–190 | Transaction type, e.g. `TRSF E-BANKING DB`. Always one line |
| Detail | 190–305 | Counterparty and reference, up to five lines below the marker |
| CBG | 305–370 | Originating branch code. Kept in the description, because it is the only thing distinguishing some same-day fee rows |
| Mutasi | 370–440 | Right-aligned near x≈400, unsigned: `205,000.00` (comma thousands, dot decimal) |
| Flag | 440–460 | Literal `DB` on an outflow, empty on an inflow |

How BCA differs from Mandiri, and what each difference requires:

1. **Variable-height rows.** A row is as tall as its detail text: one line for `BIAYA ADM`, five for a GoPay top-up (12.1pt between lines, 14.1pt to the next marker). A row therefore owns **everything from its marker down to the next marker, uncapped**. A midpoint rule would cut tall rows in half, and any cap would truncate them.
2. **The last row on a page has no next marker.** It is capped at `MAX_ROW_HEIGHT = 60`pt (tallest observed row: 48.5pt) **and** by `pageTrailerY`, the highest of:
   - the closing totals block (`SALDO AWAL`, `MUTASI CR`, `MUTASI DB`, `SALDO AKHIR` at x ≥ 190). Its amounts are right-aligned into the CBG column and its counts into MUTASI, so a last row that absorbed it would gain a junk branch code or an invented amount. The height cap alone is not enough: the block sits about 68pt below a three-line last row but only about 44pt below a single-line one, and fee or interest rows at the foot of a statement are usually single-line;
   - the `Bersambung ke halaman …` continuation footer.
   - A `SALDO AWAL` in the Keterangan column (x < 190) is the real opening-balance row. It has no `MUTASI` amount, so it falls out with every other amount-less row and needs no special case.
3. **Direction comes from the `DB` marker column, not a sign.** Any value other than `DB` or empty means the column was misread, so the row is **dropped** rather than defaulted to inflow.
4. **There is no year on the row.** The year comes from the `PERIODE : AGUSTUS 2026` page header, found by scanning along the label's baseline because the header block is right-aligned and shifts with the account number's width. Month names are full Indonesian names. Without a period, nothing can be dated and the parser returns `[]`.
   - A row whose month differs from the period is dropped, **except** a December row on a January statement, which rolls the year back. A misdated row would silently land in the wrong period.

### Fixtures and samples

**Real e-statements must never be committed** (account numbers, holder names, counterparties). `.gitignore` denies `docs/e-statements/*.pdf` by default and allows only the generated samples.

| File | Purpose |
|---|---|
| `bca-pdf.parser.spec.ts`, `mandiri-pdf.parser.spec.ts` | Hand-built text items at real-sample coordinates; exercise column slicing |
| `bca-pdf.samples.spec.ts` | Runs the full path (pdfjs → period → rows → parse) on the synthetic sample PDFs |
| `docs/e-statements/make-bca-statements.js`, `make-statements.js` | Regenerate the BCA and Mandiri sample PDFs on the real geometry |

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `parsers/*.spec.ts` | Each parser's column slicing, amount/date parsing, dedup hashing, malformed-row skipping |
| Unit | `pdf-text.util.spec.ts` | Signature detection, extraction, error mapping |
| E2E | `test/concurrency.e2e-spec.ts` (P0-3) | Same-day distinct rows, garbage and negative rows skipped, re-import dedup, CSV↔PDF route rejection |
