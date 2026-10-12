# ADR-022: Bank statement import accepts PDF e-statements alongside CSV (Reversing PRD §10)

**Status:** Accepted (Reverses the PRD §10 non-goal "PDF bank statement parsing")

**Context:**
PRD §10 deferred PDF parsing because Kasync had deferred it. In practice the bank delivers mutasi rekening as a PDF e-statement, so every reconciliation cycle began with a manual PDF→CSV conversion — the exact friction reconciliation was meant to remove. The deferral was inherited, never justified on its own merits.

Scope is deliberately one bank: the Mandiri Livin e-statement. A second sample in `docs/e-statement/` is filed as "mutasi bca.pdf" but is in fact a **Bank Sultra** statement with an unrelated layout; it is not implemented and must not be keyed as `BCA`. *(Extended by ADR-026: a genuine BCA e-statement was obtained later and is now implemented as `BCA_PDF`. Everything else in this ADR stands.)*

**Decision:**
1. **PDF is added, CSV is untouched.** A new `POST /import/pdf/:accountId?format=…` sits beside the existing `POST /import/csv/:accountId`. One route per container so each validates its own file type and the CSV contract stays byte-for-byte identical.
2. **Format keys carry the container:** `MANDIRI_PDF` joins `BCA` and `MANDIRI`. The list moved into `packages/api-contracts` (`BankImportFormatSchema`, `BANK_IMPORT_FORMATS`) because the API switch and the web picker previously duplicated it and could drift (ADR-010).
3. **`pdf-parse@1.1.4`, with a custom `pagerender`.** Its default renderer is unusable: it concatenates runs on a line with **no separator** (`text += item.str`) and splits lines on **exact float equality** of the baseline. We supply our own renderer and consume positioned text runs.
4. **Parse by column geometry, not by line regex.** The statement is a fixed grid (`No` x=20, date/time x=52, description x=124, nominal and saldo right-aligned). Rows are grouped around the sequential `No` marker, each claiming the runs between the midpoints to its neighbours. Page furniture and the disclaimer page fall outside every row and need no blocklist.
5. **Direction comes from the sign on Nominal** (`+` → INFLOW, `-` → OUTFLOW); the saldo column is discarded. Amounts are Indonesian-formatted (`1.099.500,00`).
6. **`txnDate` stores the day only**, consistent with both CSV parsers and the matching engine. The clock time is folded into `dedupHash`, where it separates same-day rows.
7. **The row number is excluded from `dedupHash`.** It restarts at 1 in every statement, so including it would give the same transaction a different hash on an overlapping re-import and defeat `@@unique([accountId, dedupHash])` — a silent double-import.
8. **File type is detected by signature, never mimetype.** The multipart mimetype is client-supplied and routinely wrong; Nest's `FileTypeValidator` rejected legitimate CSV uploads in our own e2e suite. Both routes check the `%PDF-` magic bytes instead.
9. **Encrypted PDFs are rejected, not decrypted.** Mandiri ships e-statements password-protected and `pdf-parse` has no password support at all. The user removes the password before uploading; a locked file returns an actionable Indonesian message.

**Consequences:**
- (+) Statements import directly, removing the manual conversion step.
- (+) No `schema.prisma` change: PDF rows produce the same `ParsedTransaction`, and the existing unique constraints already make re-import idempotent.
- (+) Verified against the real 57-transaction statement: every row parsed, and the amounts reconcile exactly from the opening to the stated closing balance.
- (−) One new runtime dependency (`pdf-parse`), pinned to 1.1.4. v2 is ESM-only and pulls the native `@napi-rs/canvas`, both hostile to this CJS/Alpine build.
- (−) The parser is tuned to one issuer's layout; another bank needs a new parser, and a Mandiri redesign would break this one.
- (−) Password-protected files require a manual unlock step by the user.
- (−) No end-to-end test parses a real PDF: statements are personal financial records and cannot be committed, and a hand-generated PDF was not accepted by the bundled pdf.js. Parsing is covered by unit tests over extracted geometry; the HTTP route is covered by e2e error paths.

**Alternatives considered:**
- *Replace CSV entirely*: rejected — discards working, tested importers for no gain.
- *One endpoint sniffing the container from magic bytes*: rejected — `format` is still required to choose the bank, so it removes no parameter while coupling "which bank" to "which container".
- *`pdfjs-dist` / `unpdf`*: genuinely better on encrypted PDFs and error granularity, but v4+ `pdfjs-dist` is ESM-only and breaks under this repo's `module: commonjs`. Reconsider if password support becomes a requirement.
- *Lenient repair of malformed amounts*: rejected — malformed amounts came from a synthetic sample, not real output. Guessing a money value is worse than skipping the row, which surfaces as an unreconciled gap.
- *Regexing flattened page text*: rejected — description, date, time and amount interleave unpredictably once the grid is flattened.
