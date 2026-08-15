# OhMyPos — POS & Back

## Mission
Create implementation-ready, token-driven UI guidance for OhMyPos — POS & Back that is optimized for consistency, accessibility, and fast delivery across a multi-branch F&B/retail dashboard web app.

## Brand
- Product/brand: OhMyPos — POS & Back
- Audience: authenticated users and operators (business owner, per-branch cashiers)
- Product surface: dashboard web app (Next.js frontend, monorepo with the NestJS backend)

## Style Foundations
- Visual style: structured, tokenized, content-first — density varies deliberately by screen (high density for Sales Entry, standard for data tables, more breathing room for Reports)
- Fonts:
  - `font.family.primary=Plus Jakarta Sans` — all UI text and headings
  - `font.family.stack=Plus Jakarta Sans, Plus Jakarta Sans Fallback, ui-sans-serif, system-ui, sans-serif`
  - `font.family.mono=JetBrains Mono` — all numeric/tabular data (prices, HPP, stock quantities, transaction totals)
  - `font.size.base=14px`, `font.weight.base=400`, `font.lineHeight.base=20px`
- Typography scale: `font.size.xs=12px`, `font.size.sm=13px`, `font.size.md=14px`, `font.size.lg=16px`, `font.size.xl=20px`
- Heading weights: `font.weight.heading=600–700`, `font.weight.label=500`, `font.weight.body=400`
- Color palette:
  - Brand: `color.brand.primary=#00BFFF`
  - Accents (analogous): `color.accent.inflow=#00FFBF` (money in / stock in / success), `color.accent.outflow=#0040FF` (money out / stock out / secondary emphasis)
  - Text: `color.text.primary=#0f172a`, `color.text.secondary=#334155`, `color.text.tertiary=#64748b`, `color.text.inverse=#ffffff` (text on brand/dark-filled surfaces — never the brand color itself)
  - Surface: `color.surface.base=#f8fafc`, `color.surface.muted=#ffffff`, `color.surface.raised=#ffffff`, `color.surface.strong=#e0f6ff`
  - Border: `color.border.default=#e2e8f0`
  - Status: `color.status.success=#00FFBF` (reuses the inflow accent), `color.status.warning=#f59e0b`, `color.status.danger=#ef4444`
  - Focus: `color.focus.ring=rgba(0, 191, 255, 0.5)` (brand primary at 50% opacity — plain rgba for broad tooling/browser compatibility)
- Spacing scale: `space.1=4px`, `space.2=8px`, `space.3=12px`, `space.4=16px`, `space.5=24px`, `space.6=32px`
- Radius: `radius.xs=4px`, `radius.sm=8px` (default for cards, inputs, buttons, modals), `radius.md=12px` (larger surfaces only, used sparingly)
- Shadow: `shadow.1=rgba(15, 23, 42, 0.08) 0px 1px 3px 0px` — single ambient layer only; do not stack multiple shadow layers or add colored/glow shadows
- Motion: `motion.duration.instant=150ms`, `motion.duration.fast=200ms`

## Signature Element — Flow Indicator
Any number representing movement (KPI cards, stock in/out rows, income-by-payment entries) uses a consistent custom motif built from `color.accent.inflow` / `color.accent.outflow` — not a generic up/down arrow. Define this once as a shared component and reuse it everywhere movement is shown, rather than a bespoke treatment per screen.

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required (`color.focus.ring`, never hidden or suppressed).
- Contrast constraints required — verify `color.text.*` against `color.surface.*` combinations at implementation time, particularly `text.tertiary` on `surface.strong`.

## Writing Tone
Concise, confident, implementation-focused.

## Rules: Do
- Use semantic tokens, not raw hex values, in component guidance.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error (`color.status.danger`).
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.
- Density must follow the screen it belongs to (high density for Sales Entry, standard for Master Data / Expenses / Inventory, relaxed for Reports) — not a single uniform density across the app.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions — use the defined scale.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.
- Do not stack multiple shadow layers or use decorative gradients unrelated to the Flow Indicator system.
- Do not use the unmodified shadcn/ui default radius, shadow, or gray scale — tokens above override the defaults.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure
- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Domain-specific components to define explicitly: the Flow Indicator, the branch selector (filter for owner role vs. fixed badge for cashier role), the bank-transaction split-allocation widget (Reconciliation screen), and the Central/Branch Purchase tag (Expenses & Purchases screen) — these are specific to OhMyPos and won't come from a generic component library.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.

## Approved Mockup

A full-app mockup exists in Claude Design: project `bf321a39-26cf-49bc-b774-c75783ebdf2f`, file `OhMyPos App.dc.html` (`Sales Entry.dc.html` is a companion). It is a single 1440×900 Design Composer template covering nine states: Login, the app shell (216px sidebar + 52px topbar), Dashboard, Penjualan (POS), Data Master, Pengeluaran, Stok & Inventori, Rekonsiliasi, and Laporan.

**Status: reference, not specification.** Implementation is deliberately deferred until the Phase 3 domain modules exist — five of its screens render data the system cannot yet produce. Read it for layout, density, and component anatomy; do not treat it as an access-control or data-model spec.

### Where the mockup and the binding docs disagree

Each of these was reviewed and resolved **in favour of the docs**. Do not "fix" the implementation to match the mockup on these points without a new ADR.

| Mockup shows | Binding doc | Resolution |
|---|---|---|
| `text.primary` `#020817`, `surface.base` `#f1f5f9` | This doc: `#0f172a`, `#f8fafc` | This doc wins; `packages/ui` already carries the documented values. Brand, accents, border, radius and the type scale match already. |
| Roles `owner` / `cashier` only | ADR-011 — three roles | `ADMIN` must be derived from the same visual language; it has no state in the mockup. |
| Cashier sidebar includes Data Master and Stok | System Design v4 §5 — `KASIR` gets `(pos)/sales` only | Docs win. |
| Branch chosen at login, plus "PIN kasir" | ADR-011 §2 — branch comes from `User.branchId`; email + password | Docs win. The mockup contradicts itself here: its own topbar correctly shows "Kemang · terkunci" for a cashier. |

The mockup also introduces `--warning-foreground #b45309`, which this doc does not define. It is a reasonable addition for text on warning surfaces — add it here properly if Phase 3 needs it, rather than inlining the hex.