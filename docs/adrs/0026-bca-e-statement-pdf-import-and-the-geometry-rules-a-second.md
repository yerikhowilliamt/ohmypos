# ADR-026: BCA e-statement PDF import, and the geometry rules a second issuer forces

**Status:** Accepted (Extends ADR-022; does not supersede it — the Mandiri parser is unchanged)

**Context:**
ADR-022 added PDF import for exactly one issuer, Mandiri Livin, and recorded that the only BCA-labelled sample then on hand (`mutasi bca.pdf`) was really a Bank Sultra statement with an unrelated layout, so `BCA` stayed CSV-only. A genuine BCA "Laporan Mutasi Rekening" e-statement is now available — 7 pages, 63 transactions — and its layout is nothing like Mandiri's. Reusing `MandiriPdfParser` was not an option, and the differences are not cosmetic: two of them are data-integrity decisions, not formatting ones.

Three properties of the BCA grid drive everything below:
1. **No row-number column.** Mandiri's rows are keyed off a sequential `No` marker; BCA has none.
2. **Variable row height.** A BCA row is as tall as its detail text — one line for `BIAYA ADM`, five for a GoPay top-up — where Mandiri's rows sit on a fixed ~46pt pitch.
3. **No year on the row.** The date cell reads `13/08`. The year appears only in the page header, as `PERIODE : AGUSTUS 2026`.

**Decision:**
1. **A separate `BcaPdfParser`, keyed `BCA_PDF`.** Added to `BankImportFormatSchema`/`BANK_IMPORT_FORMATS` (ADR-010, ADR-022 Decision 2) and to `BankParserFactory`. No route, contract, or schema change: the existing `POST /import/pdf/:accountId` and `ParsedTransaction` already carry it. ADR-022's statement that BCA must not be keyed as PDF is superseded on that one point only.
2. **Rows are keyed off the `DD/MM` date cell, and a row runs to the *next* date marker — with no height cap.** The next marker is the true boundary; clamping short of it silently truncates a tall row's description. Only the last row on a page has no marker beneath it, and there a 60pt cap applies.
3. **The page's trailing furniture is matched explicitly, not merely out-capped.** The closing totals block (`SALDO AWAL`/`MUTASI CR`/`MUTASI DB`/`SALDO AKHIR`) right-aligns its amounts into the **CBG** column and its transaction counts into the **MUTASI** column. It sits ~68pt below the marker of a three-line last row but only ~44pt below a single-line one — and a fee or interest row at the foot of a statement is routinely single-line. A height cap alone would therefore let a last row inherit a junk branch code, or, on an amount-less row, an invented amount. The block's labels (in the detail column, x ≥ 190, which distinguishes them from a real `SALDO AWAL` row whose label sits in KETERANGAN at x ≈ 88.7) and the `Bersambung ke halaman berikut` footer form an explicit floor.
4. **Direction comes from a marker column, not from a sign.** BCA prints a bare `DB` at x ≈ 442 on outflows and nothing at all on inflows — the opposite of Mandiri's `+`/`-` prefix. A value in that column that is neither `DB` nor empty means the column was misread, so the row is dropped rather than defaulted to `INFLOW`.
5. **Money is US-formatted here.** `205,000.00` — the comma groups thousands and the dot divides. This is the exact inverse of Mandiri's `1.099.500,00`, and the two parsers must never share an amount regex.
6. **The year is derived from the `PERIODE` header, and a row the header cannot date is dropped.** A row whose month matches the period takes the period's year. The single exception is a December row on a January statement, which takes the previous year — BCA does carry the tail of the previous month across a year boundary. Any *other* month mismatch is dropped. A statement with no readable `PERIODE` header yields zero transactions rather than a guess.
7. **`dedupHash` excludes everything page-relative,** as in ADR-022 Decision 7. BCA prints no clock time, so the signature is date + description + amount + type, with a counter separating byte-identical rows. Nothing about page or row position enters it, so an overlapping re-import stays idempotent against `@@unique([accountId, dedupHash])`.
8. **Description joins KETERANGAN + detail + CBG.** The branch code is kept because it is the only thing distinguishing some same-day fee rows from each other.
9. **The real statement is not committed.** It carries a live account number, the holder's name, a phone number and counterparty names. `docs/e-statements/` is now default-deny for PDFs, with the synthetic samples allow-listed. `docs/e-statements/gen-bca-pdf.js` reproduces the measured geometry — variable row heights, the tight totals block, the letter-spaced legal notice that lands in the CBG and MUTASI columns — so the sample statements exercise the real traps without holding real data.

**Consequences:**
- (+) Verified against the real 7-page statement: all 63 transactions parsed, and the CR/DB totals (20 / 3,440,700.00 and 43 / 3,826,360.00) reconcile **exactly** with the statement's own summary block.
- (+) No schema, route, or frontend change. The format picker is data-driven off `BANK_IMPORT_FORMATS`, so `BCA (PDF e-Statement)` appears with no UI edit.
- (+) Building the sample generator against the measured geometry caught two live defects before release: the height cap truncating tall rows (Decision 2) and the totals block leaking into a short last row (Decision 3). Neither was reachable from the one real statement on hand, whose last row happens to be three lines tall.
- (−) A third issuer means a third parser. Two parsers now share only `pdf-text.util.ts`; the column geometry, the amount format, the direction rule and the date rule all differ. A common "PDF table" abstraction was considered and rejected below.
- (−) The parser is tuned to one layout. A BCA redesign breaks it, and the geometry must be re-derived against a real sample rather than adjusted by guess.
- (−) A row dated outside the statement period is dropped rather than imported. This surfaces as an unreconciled gap, which is the intended failure direction, but it is a silent one.

**Alternatives considered:**
- *Generalise `MandiriPdfParser` with a configurable column map*: rejected. The two issuers share the idea of a table and nothing else — marker column vs. date column, fixed vs. variable row height, sign vs. marker for direction, dot- vs. comma-grouping, year-on-row vs. year-in-header. A config object expressive enough to cover both is a worse artefact than two direct parsers, and it couples a working Mandiri importer to every future BCA change.
- *Rely on `MAX_ROW_HEIGHT` alone to exclude the totals block*: rejected — see Decision 3. It happens to work on the sample in hand and fails on a single-line last row, which is the more common shape.
- *Derive direction from the running SALDO delta instead of the `DB` marker*: rejected. It is self-validating where it works, but BCA prints the running balance only intermittently — most rows have an empty SALDO cell, so direction would be underivable for the majority of them.
- *Infer the year from the filename* (`3940774470_AGU_2026`): rejected — the filename is user-renameable and is not part of the document.
- *Import an out-of-period row under the period's year anyway*: rejected. It converts a visible gap into a transaction silently filed in the wrong month, which is the failure direction ADR-022 already chose against.
- *Flatten each line and regex it*: rejected for the same reason as ADR-022, and more strongly here — BCA's 4–5-line detail blocks and its `TANGGAL :10/08` continuation line both parse as separate transactions once the grid is flattened.
