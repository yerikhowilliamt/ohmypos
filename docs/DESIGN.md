# OhMyPos — POS & Backoffice Design System

> **Section numbers in this document are load-bearing.** The codebase cites them by number in source comments. Renumbering a section is therefore a breaking change: run `grep -rn "DESIGN.md §" apps packages` and update every site in the same commit. Always cite by number **and** name — `§7 Spacing`, never `§7` — so a stale reference is visible rather than silent. A citation that still resolves after a renumber, but to unrelated content, is the failure mode this rule exists to prevent (see TASK-069).

## 1. Context and Mission

OhMyPos is a multi-branch F&B, luxury hospitality, and high-end retail POS & Backoffice web application.

The product serves:
- Business owners
- Administrators
- Branch cashiers & boutique concierges

The system covers:
- POS / Sales Entry (Touch & Barcode)
- Products and Master Data
- Expenses and Purchases
- Inventory & Stock Management
- Bank Reconciliation
- Financial & Operational Reporting
- Multi-branch Operations

The design must support intense operational work in five-star hotels, luxury boutiques, specialty cafés, and fine dining establishments without sacrificing transaction speed or back-office data reliability.

The primary design objective is:
> **Elevate OhMyPos into a luxury, premium, and high-end elegance business operating system that delivers instant operational speed, quiet luxury aesthetics, and uncompromising financial precision.**

The design language is:
> **Luxury Hospitality & High-End Retail UI (Dual-Tone Warm Alabaster, Obsidian Slate & Champagne Gold Accents)**

---

---
## 2. Design North Star
### Core Principle: *Quiet Luxury Outside, High-Precision Engine Inside.*

The interface conveys understated luxury through:
- Warm alabaster & ivory surfaces (`#FBF9F5`, `#FFFFFF`) paired with rich obsidian dark accents (`#12151B`)
- Muted champagne gold and warm bronze highlights (`#C5A880`, `#A37D4E`)
- Crisp hairline borders (`#EAE4DC`) and refined micro-radii (2px–6px)
- Editorial typography pairing (High-end Display Serif for titles & branding, clean Geometric Sans for UI labels, and Tabular Monospace for financials)
- Restrained, flat elevations without muddy or excessive drop shadows
- Generous, proportional whitespace and disciplined grid alignment

The interface remains operationally indestructible through:
- Predictable navigation and instant keyboard/touch shortcuts
- High-contrast typography exceeding WCAG 2.2 AA standards
- Information density where required (dense tabular views in Backoffice, touch-friendly grid in POS)
- Explicit status hierarchy with jewel-toned semantic tags
- Persistent POS cart context with immediate single-tap checkout actions
- Transaction speed that never stutters during peak service hours

---

---
## 3. Product Character & Aesthetic Pillars

### 3.1 Quiet Luxury & Architectural Restraint
- **Surfaces:** Warm alabaster canvases, crisp porcelain card elevations, and deep obsidian contrasting panels.
- **Accents:** Champagne gold (`#C5A880`) and antique bronze (`#A37D4E`) for active states, selection outlines, and luxury badges.
- **Borders:** Ultra-crisp 1px hairline dividers and subtle metallic/stone borders instead of diffuse shadows.
- **Avoid:** Bubbly rounded pills, neon saturation, cyan/purple SaaS gradients, glassmorphism, heavy blur, or excessive drop shadows.

### 3.2 Enterprise Precision & Trust
- Structured navigation with persistent branch and role awareness.
- High-density data tables with sticky primary identifier columns and right-aligned tabular numbers.
- Unambiguous status indicators and explicit transaction boundaries.

### 3.3 High-Touch Retail & Hospitality POS
- Touch-friendly product discovery with minimalist product cards.
- Horizontal category filter cards with quantity counts and gold-trimmed active states.
- High-contrast "Make Order" action anchored in an obsidian right-rail order panel.

---

---
## 4. Information Density by Screen

| Surface | Density | Visual Priority | Primary Interaction |
|---|---|---|---|
| **POS / Sales Entry** | High | Immediate Scannability & Checkout Speed | Touch / Barcode / Tap-to-Cart |
| **Dashboard** | Medium | Executive Awareness & KPI Health | Glanceable KPI & Trend Charts |
| **Master Data** | Medium-High | Structured Catalog Management | Search, Filter & Bulk Edit |
| **Expenses & Purchases** | Medium-High | Auditability & Line-Item Tracking | Quick Entry & Status Review |
| **Inventory & Stock** | High | Real-time Quantity & Valuation | Stock Threshold Monitoring |
| **Reconciliation** | High | Precise Financial Allocation & Matching | Split Allocation & Verification |
| **Reports** | Medium | Analytical Clarity & Executive Insights | Filter, Compare & Data Export |

---

---
## 5. Typography System

The typography architecture uses a tripartite hierarchy:
1. **Display & Brand Headings:** *Cormorant Garamond* (or *Cinzel/Playfair* fallback) — confers luxury editorial polish.
2. **UI Controls, Labels, and Body:** *Plus Jakarta Sans* (or *Inter* fallback) — ensures instant operational readability.
3. **Financials, Quantities, and Identifiers:** *JetBrains Mono* — guarantees tabular alignment and zero numerical ambiguity.

### Font Families
```css
font.family.display = 'Cormorant Garamond', 'Cinzel', serif
font.family.primary = 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif
font.family.mono    = 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
```

### Type Scale
```css
font.size.xs   = 11px / line-height: 16px (micro labels, table captions)
font.size.sm   = 13px / line-height: 18px (secondary text, badges, table cells)
font.size.base = 14px / line-height: 20px (default body, inputs, buttons)
font.size.md   = 15px / line-height: 22px (prominent form labels, nav items)
font.size.lg   = 18px / line-height: 24px (card titles, modal headers)
font.size.xl   = 22px / line-height: 28px (section titles, panel headers)
font.size.2xl  = 26px / line-height: 32px (page titles, KPI metrics)
font.size.3xl  = 32px / line-height: 38px (hero metrics, executive summaries)
```

### Font Weights
- Body / Descriptions: `400 (Regular)`
- Form Labels / Controls: `500 (Medium)`
- Headings & Table Headers: `600 (Semibold)`
- Dominant Metric Totals / Brand: `700 (Bold)`

---

---
## 6. Color Tokens (Luxury Palette)

All implementations must reference semantic tokens rather than raw hex codes.

### 6.1 Brand & Accent Palette
```css
/* Core Luxury Brand */
color.brand.primary      = #C5A880  /* Champagne Gold */
color.brand.primary.hover= #B3936A  /* Deep Gold */
color.brand.primary.soft = #F7F2EA  /* Ivory Gold Tint */
color.brand.secondary    = #A37D4E  /* Warm Antique Bronze */
color.brand.tertiary     = #1E293B  /* Deep Slate / Charcoal */

/* Financial Movement Accents (Flow Indicator) */
color.accent.inflow      = #166534  /* Deep Imperial Emerald (Money In / Stock In) */
color.accent.inflow.soft = #ECFDF5  /* Emerald Wash */
color.accent.outflow     = #9F1239  /* Muted Regal Rosewood (Money Out / Stock Out) */
color.accent.outflow.soft= #FFF1F2  /* Rosewood Wash */
```

### 6.2 Status Tokens (Jewel Tones)
```css
color.status.success     = #15803D  /* Forest Emerald */
color.status.warning     = #B45309  /* Amber Bronze */
color.status.danger      = #B91C1C  /* Deep Crimson */
color.status.info        = #475569  /* Slate Gray */
```

### 6.3 Surfaces & Backgrounds (Dual-Tone Ivory & Obsidian)
```css
color.surface.base       = #FBF9F5  /* Warm Alabaster / Main Page Canvas */
color.surface.muted      = #F4EFEB  /* Soft Ivory / Secondary Sections */
color.surface.raised     = #FFFFFF  /* Pure Porcelain / Elevated Cards & Tables */
color.surface.strong     = #F7F2EA  /* Selected / Active Tint */
color.surface.dark       = #12151B  /* Obsidian Slate / Dark Mode & POS Order Rail */
color.surface.dark.raised= #1A1E26  /* Elevated Obsidian Container */
```

### 6.4 Text Tokens
```css
color.text.primary       = #18181B  /* Rich Charcoal (95% contrast against base) */
color.text.secondary     = #52525B  /* Warm Slate */
color.text.tertiary      = #8C827A  /* Muted Warm Stone */
color.text.inverse       = #FFFFFF  /* Pure White */
color.text.gold          = #C5A880  /* Metallic Gold Heading / Metric */
```

### 6.5 Borders & Rings
```css
color.border.default     = #EAE4DC  /* Hairline Warm Stone Border */
color.border.strong      = #D6CDBF  /* Defined Border / Table Headers */
color.border.gold        = #C5A880  /* Active Selection Gold Border */
color.focus.ring         = rgba(197, 168, 128, 0.45) /* Champagne Halo */
```

### 6.6 Dark Theme — Back-Office Only

A dark theme exists for night-shift back-office use (`(back-office)` route group — ADMIN/OWNER only). It is **not** a general dark-mode toggle: POS and the shared routes (profile/help/leave-requests, reachable by KASIR) never render it, by construction — see System Design/AppShell's `enableDarkMode` prop. It reuses the Obsidian surfaces already defined for the POS dark order-panel option (§11.4) as its base and applies under a `[data-theme="dark"]` scope on the back-office shell, not on `<html>`/`<body>`.

```css
/* Surfaces */
color.surface.base       = #12151B
color.surface.muted      = #0D0F14
color.surface.raised     = #1A1E26
color.surface.strong     = #2B2A29  /* Gold-tinted selected state */

/* Text */
color.text.primary       = #F5F2EC
color.text.secondary     = #B8AFA0
color.text.tertiary      = #8A8275
/* color.text.gold and color.text.inverse are unchanged — gold already
   reads 8:1+ against the new surfaces, and inverse is only used by the
   tooltip chip, which stays a fixed dark surface in both themes. */

/* Brand — primary/secondary/hover unchanged; the light "soft" washes and
   the tertiary slate need dark-specific values or they'd collide with the
   now-light text tokens above. */
color.brand.primary.soft   = #36322F
color.brand.secondary.soft = #2F2A25
color.brand.tertiary       = #94A3B8
color.brand.tertiary.soft  = #242D3B

/* Borders */
color.border.default = #2A2E38
color.border.strong  = #3D4250

/* Status & financial accents — chosen as a balance between plain-text-on-
   dark-surface (the dominant usage across the codebase) and white-text-
   on-solid-fill (badges, KPI cards); no single value clears WCAG AA on
   both axes, the same trade-off already accepted for the light theme's
   gold buttons. Financial accents have no solid-fill usage, so they go
   straight to the more legible value. */
color.status.success  = #16A34A
color.status.warning  = #D97706
color.status.danger   = #E5484D
color.status.info     = #7382A0
color.accent.inflow       = #22C55E
color.accent.inflow.soft  = #153126
color.accent.outflow      = #FB7185
color.accent.outflow.soft = #37242C

/* Shadows need much higher opacity to read against a dark surface. */
shadow.1 = 0px 1px 2px 0px rgba(0, 0, 0, 0.3)
shadow.2 = 0px 4px 16px -2px rgba(0, 0, 0, 0.45)
```

Typography (§5), spacing (§7 Spacing), radius (§8.1 Radius Scale), and motion (§9 Motion) tokens are unchanged in dark mode.

### 6.7 Building Components That Survive Both Themes

The dark theme is delivered **entirely by token redefinition** — the block above re-resolves the same semantic variables under `[data-theme="dark"]`, scoped to the back-office shell element rather than to `<html>`. Nothing else in the system knows the theme exists.

That has one consequence, and it is the whole rule:

- **Components reference semantic tokens only.** A literal colour — a hex, `bg-black`, an rgba — does not participate in the redefinition and will be wrong in one of the two themes. There is no component-level dark variant to write, and writing one is itself the error.
- **Specifications in §10–§21 name light-theme values for readability. Read every `#RRGGBB` in this document as *the token whose light value is that*, never as a value to type into a component.** Where a rule names a token, use the token.
- **The one sanctioned literal is `text-white` over a solid semantic fill** — status badges, KPI tiles, the primary button. White stays legible on those fills in both themes; `color.text.inverse` is its token form and does not change (§6.6).

**What changes in dark mode:** surfaces and text invert, borders darken, the soft brand washes take dark-specific values, and status/flow accents brighten to stay legible on obsidian.

**What must not change:** typography, spacing, radius, motion, layout, density, and the *meaning* of any status colour. A theme swap is a change of surface, never of semantics — an operator must not have to re-learn the screen at night.

**Scope.** Only the `(back-office)` shell emits `data-theme`. POS and the shared routes (profile, help, leave requests) never do, so any component reachable by a KASIR must be correct in the light theme with no dark counterpart at all.

**How to check.** A component is theme-safe when a search for literal colours inside it comes back empty:

```bash
grep -nE "(bg|text|border|ring)-(white|black|\[#)" <file>
```

Today the only hits across the codebase are `text-white` over solid fills, which is the sanctioned case above.

---

---
## 7. Spacing

```css
space.1 = 4px
space.2 = 8px
space.3 = 12px
space.4 = 16px
space.5 = 24px
space.6 = 32px
space.7 = 40px
space.8 = 48px
```

Do not introduce arbitrary spacing values.

- **Tighter spacing** for elements that belong together: data tables, POS rows, filter groups, related controls.
- **Larger spacing** for elements that do not: page sections, major panels, unrelated groups, report sections.

---
## 8. Micro-Radius & Elevation System

### 8.1 Radius Scale (Sharp & Refined)
Avoid bubbly, high-radius components. Shapes must feel architectural and precise.
```css
radius.xs   = 2px   /* Micro tags, inner indicators */
radius.sm   = 4px   /* Buttons, inputs, dropdown triggers, stepper controls */
radius.md   = 6px   /* Standard cards, dialogs, table containers */
radius.lg   = 8px   /* POS product cards, major panels */
radius.xl   = 12px  /* Application shell containers */
radius.pill = 9999px/* Reserved ONLY for status dots / micro status pills */
```

### 8.2 Elevation & Shadows
Elevations rely on hairline 1px borders and micro-ambient occlusion.
```css
shadow.1 = 0px 1px 2px 0px rgba(24, 24, 27, 0.04)  /* Standard Card */
shadow.2 = 0px 4px 16px -2px rgba(24, 24, 27, 0.08) /* Floating Modal / Dropdown */
```
*Rule:* Never apply heavy drop shadows or colored neon glows.

---

---
## 9. Motion

```css
motion.duration.instant = 150ms
motion.duration.fast    = 200ms
motion.duration.normal  = 250ms
```

Motion exists to communicate a state change, never to decorate.

- **Use for:** hover, focus transitions, dropdowns, dialogs, drawers, cart updates, navigation transitions.
- **Avoid:** bouncing, large scale animations, decorative transitions, motion with no state behind it.
- **Respect `prefers-reduced-motion`** everywhere (§22 Accessibility & Compliance).

---
## 10. Application Shell & Navigation

### 10.1 Desktop Layout Anatomy
- **Backoffice:** Fixed Warm Alabaster Sidebar (≈ 220px) + Compact Topbar (≈ 50px) + Content Canvas.
- **POS / Sales Entry:** Three-Zone Full-Height Layout (Sidebar / Product Discovery / Obsidian Order Panel).

### 10.2 Sidebar Specifications
- **Surface:** `color.surface.raised` or `color.surface.base`, with a right hairline border (`color.border.default`).
- **Brand Mark:** Display font in `color.text.primary` with a `color.brand.primary` emblem.
- **Active Navigation Item:**
  - Background: `color.surface.strong`
  - Left border accent or text: `color.brand.primary` / `color.text.primary`
  - Font weight: `600 (Semibold)`
- **Account Card:** Bottom-pinned subtle container displaying user avatar, name, and role badge (`OWNER`, `ADMIN`, `KASIR`).

### 10.3 Topbar Specifications (Backoffice)
- **Height:** 50px.
- **Components:** Branch Selector (or fixed badge for Cashier), Date Range Context, Profile & Notification trigger.

### 10.4 Page Header
- **Title:** `font.size.2xl`, `700`, `color.text.primary`, tracking-tight.
- **Subtitle:** one line at `font.size.sm` / `color.text.secondary` stating what the screen is for and who acts on it — not a restatement of the title.
- **Placement:** first block inside the content canvas, above filters and above any summary cards.
- Screen-level actions (Export, Tambah …) align right on the title's baseline; filters belong in their own row below, never in the header.

---

---
## 11. POS / Sales Transaction Architecture

### 11.1 Three-Zone POS Layout
```
┌────────────┬──────────────────────────────┬──────────────────────┐
│ Sidebar /  │ Header (Title + Date + Srch) │ Detail Order Panel   │
│ Navigation │ Category Filter Cards        │ (Obsidian / Dark)    │
│            ├──────────────────────────────┤ ──────────────────── │
│ (220px)    │ Product Grid                 │ Customer Selector    │
│            │ (Porcelain Cards, Gold Line) │ Order List + Stepper │
│            │                              │ ──────────────────── │
│            │                              │ Summary + Tax        │
│            │                              │ Payment Method       │
│            │                              │ [ Make Order CTA ]   │
└────────────┴──────────────────────────────┴──────────────────────┘
```

### 11.2 Product Grid & Cards
- **Card Surface:** `color.surface.raised` with a 1px `color.border.default` border.
- **Image Frame:** 1:1 or 4:3 ratio with crisp, edge-to-edge photography and subtle warm grading.
- **Typography:** Product Title in *Plus Jakarta Sans*, Price in *JetBrains Mono* in `color.text.gold` or `color.text.primary`.
- **Active / Selected State:** 1.5px `color.border.gold` outline.
- **Add Product Card:** First slot in grid with a dashed `color.border.strong` border and a centred `color.brand.primary` "+" icon.

### 11.3 Category Filter Row
- Presented as horizontal count cards (not bubbly pills).
- Displays category title and item count (e.g. `Beverage / 24 items`).
- Active State: `color.border.gold` border with a `color.surface.strong` background.

### 11.4 Order Panel (Right Rail)
- May use `color.surface.dark` (Obsidian Slate) or `color.surface.raised` (Crisp Warm Ivory).
- **Line Items:** Product thumbnail, quantity stepper, unit price, and JetBrains Mono line total.
- **Summary:** Subtotal, Service Tax (10%), and prominent Total Amount.
- **Payment Method:** Sleek select box (Cash, Card, QRIS, Bank Transfer).
- **Primary CTA ("Make Order"):** Full-width, high-contrast — `color.brand.primary` fill, or `color.text.primary` fill with a `color.border.gold` border.

---

---
## 12. Backoffice Data Tables & Financial Screens

### 12.1 Data Table Rules
- **Header:** Uppercase 11px *Plus Jakarta Sans* (`font-semibold`, tracking-wide) on `color.surface.muted`, with a `color.border.strong` bottom divider.
- **Rows:** Subtle hover state (`color.surface.base`), 1px `color.border.default` bottom divider.
- **Numbers & Dates:** Right-aligned *JetBrains Mono* (`tabular-nums`).
- **Sticky Column:** Primary identifier (e.g. Product Name, Transaction Ref) remains sticky on horizontal overflow.

### 12.2 Signature Flow Indicator
Used across all revenue, expense, and reconciliation displays:
- **Inflow (Money In / Stock In):** `color.accent.inflow` accompanied by `+` or a subtle upward chevron.
- **Outflow (Money Out / Stock Out):** `color.accent.outflow` accompanied by `-` or a subtle downward chevron.

### 12.3 Bank Reconciliation Split-Allocation
- Visual balance check: Total Amount = Allocated + Remaining.
- Remaining amount in *JetBrains Mono* highlighted in amber if unallocated, emerald when zero.
- Prevents invalid allocations with clean inline alerts.

### 12.4 Pagination

Applies to every table whose rows are fetched one page at a time from the API.

- **Footer placement:** Inside the table container, separated by a 1px hairline (`color.border.default`) — never a floating bar and never below the card. Padding `16px`.
- **Always rendered.** A single-page or empty result still shows the footer. An invisible control cannot be distinguished from one that was never built, which makes the feature unverifiable by looking at the screen.
- **Caption (left):** States the row **range**, not merely the total — `Menampilkan 26–50 dari 62 transaksi`. The operator must be able to say exactly which rows are on screen. Label text in *Plus Jakarta Sans* `font.size.xs` / `color.text.secondary`; every numeral in *JetBrains Mono* with `tabular-nums` and `color.text.primary`, so digits do not shift width between pages (§5). Empty result reads `Tidak ada <noun>`.
- **Page indicator (right):** `2 / 3` in *JetBrains Mono*, `tabular-nums`. The current page takes `600 (Semibold)` at `color.text.primary` with a 1px champagne-gold underline (`color.border.gold`); the total takes `color.text.tertiary`.
  - **Gold is an accent here, never the text colour.** `#C5A880` measures **2.26:1** against porcelain and `#A37D4E` measures 3.75:1 — both below the 4.5:1 §22 Accessibility & Compliance requires of text. Active-state gold on small numerals must be carried by a border, underline, or fill, not by the glyph.
- **Controls:** Chevron icon buttons (`variant="outline"`, `size="icon-sm"`, `radius.sm`) flanking the indicator — not full-word buttons, which are visually heavy for a table footer (§3.1 architectural restraint). Each carries an explicit `aria-label` (`Halaman sebelumnya` / `Halaman berikutnya`); they are disabled, never hidden, at the first and last page.
- **Rows-per-page selector:** A compact select sits in the table's **toolbar row**, right-aligned beside the Export button — both are controls over the whole table, whereas the footer reports the page currently shown. Fixed options **10 / 25 / 50**, numerals in *JetBrains Mono*; trigger height matches the Export button (24px) so the toolbar keeps one baseline, `radius.sm`, `aria-label="Jumlah baris per halaman"`. A free-text row count is not offered: the API caps `limit` at 100, and an unconstrained field invites values it rejects.
  - The selector reads its value from the server's `meta.limit`, never from a separate copy of the state, so the control can never disagree with the rows on screen.
  - Changing it **must** reset to page 1. Page 5 of a 10-row paging is not page 5 of a 50-row one, and keeping the number can land the operator past the end of the result.
- **Default page size:** **10 rows** on every paginated table, so the first screen stays scannable and the control is discoverable from the outset; the operator widens it when they want density. Master-data tables are not paginated at all — their volume does not warrant it, and full client-side search and sort are worth more there.
- **Sorting follows the server.** A paginated table must delegate ordering to the API. A client-side sort over one page reorders what is visible while presenting itself as sorting the whole set — on a money column that is a correctness problem, not a cosmetic one. Every sortable column's id must correspond to a backend sort key.
- **Search caveat.** Toolbar search remains a client-side column filter and therefore covers only the current page. Any paginated table exposing it must say so in the placeholder (`Cari … di halaman ini…`) until a server-side `search` filter exists for that endpoint.

---

---
## 13. Responsive Breakpoints

```css
breakpoint.desktop = ≥1280px   /* Full 3-zone layout */
breakpoint.laptop   = 1024–1279px /* Compact 3-zone layout */
breakpoint.tablet    = 768–1023px  /* Collapsed sidebar rail (64px), 3-col grid */
breakpoint.mobile    = <768px      /* Full-width catalog + Slide-up Order Sheet */
```

- **Touch Targets:** Minimum 44×44px for primary POS controls (steppers, category cards, CTAs) — full rules in §23 Touch & Pointer Interaction.
- **Mobile POS:** Persistent bottom floating summary bar (`3 items · Rp 185.000`) that expands to full order review sheet in 1 tap.

### 13.1 Sidebar Behaviour by Breakpoint

**Desktop / Laptop (≥1024px)** — Fixed, ≈216px, fully expanded (icons + labels), per §10.2.

**Tablet (768–1023px)**
- Collapses to an icon-only rail, ≈64px wide; labels appear in a tooltip or temporary flyout, never permanently.
- The active-item indicator still applies to the icon itself.
- The bottom account card collapses to the avatar; tapping it opens the full account menu as a popover.
- An expandable group opens as a flyout submenu rather than an inline indented list.

**Mobile (<768px)**
- Hidden by default, replaced by either a bottom navigation bar (max 5 top-level items, overflow into "More") or a hamburger-triggered full-height drawer mirroring the desktop sidebar.
- For KASIR specifically, whose only destination is the Sales group, a simple top tab switcher between "Transaksi" and "Riwayat" is preferred — their one workflow stays one tap away.

### 13.2 POS Behaviour by Breakpoint

**Desktop / Laptop (≥1024px)** — Full three-zone layout per §11.1, all zones visible at once.

**Tablet (768–1023px)**
- Sidebar collapses per §13.1. Product grid drops 4 → 3 columns; the Order Panel narrows proportionally.
- If both cannot stay comfortably usable, the Order Panel may become a slide-over triggered by a persistent "Pesanan (n) · Total" pill. **This is the one place a persistent zone may become an on-demand overlay.**

**Mobile (<768px)**
- Single-column: Product Discovery is full width, grid drops to 2 columns, category cards scroll horizontally in one row.
- The Order Panel becomes a bottom sheet, collapsed to a slim bar showing item count and total; tapping expands it to the full panel per §11.4.
- The payment action stays reachable in one tap from the collapsed state — never buried more than one interaction deep.

### 13.3 Backoffice Behaviour by Breakpoint

**Desktop / Laptop (≥1024px)** — Full data tables per §12.1, all columns visible.

**Tablet (768–1023px)**
- Sidebar collapses per §13.1.
- Tables keep their column structure and scroll horizontally inside their container; the primary identifying column stays pinned so context is never lost mid-scroll (§12.1).
- Filter rows may wrap to two lines. KPI card rows drop from 3–4 columns to 2.

**Mobile (<768px)**
- Prefer collapsing low-priority columns over converting to a card stack — keep the identifying and decision-critical columns, move the rest behind a row expand or detail view.
- Convert a table to stacked cards **only** when it has 4 columns or fewer and comparison loses nothing. Do not do this by default: a table exists so rows can be compared, and a card stack destroys that.
- KPI rows become single column, full width. Forms become single-column, full-width fields.

### 13.4 Typography & Spacing Scaling
- Never shrink base body text below 13px (`font.size.sm`) at any breakpoint — legibility on operational screens is not traded for density.
- Page margins step down the spacing scale: `space.6` (32px) desktop → `space.5` (24px) tablet → `space.4` (16px) mobile. No values outside §7 Spacing.
- Headline sizes may step down one level on mobile (`3xl` → `2xl`) but must stay within the §5 type scale.

---

---
## 14. Buttons

Variants map to intent, not to appearance. The implementation is `packages/ui/src/components/ui/button.tsx`; this section is the contract it satisfies.

| Variant | Intent | Treatment | Examples |
|---|---|---|---|
| `default` | The single most important action on the surface | Champagne gold fill, white label, `600`, `shadow.1` | Simpan, Bayar, Make Order |
| `outline` | Neutral secondary action | Porcelain surface, hairline border, `shadow.1` | Filter, Export, Sebelumnya |
| `secondary` | Low-emphasis alternative | Soft ivory fill, no border | Reset |
| `ghost` | Tertiary / in-table action | No fill until hover | Row actions, sort headers |
| `destructive` | Irreversible or money-removing | Deep Crimson fill, white label | Hapus, Batalkan Transaksi |
| `link` | Navigation disguised as text | Gold label, underline on hover | Inline cross-references |

- **One `default` per surface.** Two gold buttons side by side means neither is primary.
- **Radius:** `radius.sm`; `radius.xs` at the `xs` size. Never pill.
- **Sizes:** `xs` (24px) · `sm` (32px) · `default` (36px) · `lg` (40px), plus `icon`/`icon-xs`/`icon-sm`/`icon-lg` for icon-only controls. An icon-only button **must** carry an `aria-label`.
- **Disabled, never hidden**, when the action is temporarily unavailable — a control that disappears cannot be reasoned about.
- Every button defines the full state set in §18 Component State Rules.

---
## 15. Forms & Inputs

- **Every field has a visible `Label`.** Placeholder text must never replace a label — it disappears exactly when the user needs it.
- **Structure:** Label → control → helper/validation text. Validation messages sit below the control and describe what to do, not merely what is wrong (§21 Content & Tone).
- **Radius:** `radius.sm` on all inputs, selects, and dropdown triggers.
- **Focus:** champagne halo ring (`color.focus.ring`), never suppressed.
- **Invalid state:** `aria-invalid` drives the treatment — Deep Crimson border plus the message. Colour alone is never the signal (§22).
- **Required state** is explicit in the label, not inferred from an asterisk alone.
- **Money and quantity fields** use the shared `CurrencyInput` so thousand separators, decimal comma, and the mono typeface stay consistent (§20 Data Formatting & Locale).
- **Dates** use the shared `DatePicker`; free-text date entry is not offered.
- Keyboard and touch parity is mandatory (§23 Touch & Pointer Interaction).

---
## 16. Status Badges

Status badges carry every enum the operator must act on: payment status, transaction status, payable status, stock status, leave status, role.

- **Shape:** `radius.xs` (2px) — architectural, not bubbly. `radius.pill` stays reserved for status dots and micro pills only (§8.1).
- **Size:** `font.size.xs`, `500` weight, `px-2 py-0.5`.
- **Semantics come from §6.2 jewel tones**, applied as a solid fill with white text for filled variants (`success` / `warning` / `danger` / `info`), or as a soft tint with a gold hairline for the `default` variant.
- **Never colour alone.** Every badge carries its label; an icon may accompany it but never replaces it (§22).
- **The mapping lives in code and must not be re-decided per screen** — `apps/web/lib/vocabulary.ts` owns `getStockStatusBadgeClasses`, `getPaymentStatusBadgeClasses`, and `getTransactionStatusBadgeClasses`. A screen that needs a badge imports the helper; it does not choose colours.
- Indonesian labels come from the same module, so one enum reads identically everywhere.

---
## 17. Empty, Loading & Error States

Every data surface defines all three. A blank region is not a state.

**Loading.** Skeleton rows matching the shape of the content that will replace them — never a spinner in a table body, never a layout that jumps when data lands.

**Empty.** Distinguish the two cases; they call for different words and different actions:
- *Nothing exists yet* — say what the surface is for and what produces its first row. e.g. "Belum ada data transaksi penjualan." / "Transaksi yang dibuat kasir akan muncul di riwayat ini."
- *Nothing matches the current filter* — say so plainly ("Tidak ditemukan data yang cocok dengan filter."), and never offer the first-run explanation, which would read as though the data had been lost.

**Error.** Surface the server's own message rather than a paraphrase, especially for financial invariants — the backend is the authority on what it refused and why (Playbook §7). Pair it with what the operator can do next.

- No decorative empty-state illustrations. They consume operational screen area and say nothing.
- POS carts follow the same rule: "Pesanan masih kosong" plus "Pilih produk untuk memulai transaksi."

---
## 18. Component State Rules

Every interactive component must define:

`default` · `hover` · `focus-visible` · `active` · `disabled` · `loading` · `error`

Where applicable, also define:

`selected` · `checked` · `expanded` · `collapsed` · `empty` · `success` · `warning`

State changes must preserve layout stability wherever practical — a component that resizes on hover or reflows on error moves the target the user is aiming at.

---
## 19. Domain-Specific Components

These are part of the OhMyPos design system, not generic library components. Each has one canonical treatment and must not be re-invented per screen:

| Component | Canonical rule |
|---|---|
| Flow Indicator | §12.2 — the signature motif for any inflow/outflow figure |
| Branch Selector | Topbar control (§10.3); a KASIR sees a fixed badge instead |
| Cashier Fixed Branch Badge | Read-only branch identity for a branch-scoped role |
| POS Product Card | §11.2 |
| POS Cart / Order Panel | §11.4 |
| POS Payment Action | §11.4 — full-width, one tap from the collapsed state on mobile |
| Bank Transaction Split-Allocation Widget | §12.3 |
| Central / Branch Purchase Tag | Distinguishes `branchId = null` (central) from a branch purchase |
| Inventory Stock Status | Badge driven by `getStockStatusBadgeClasses` (§16) |
| Financial KPI Card | Dominant metric in mono, label above, flow-tinted where signed |

---
## 20. Data Formatting & Locale

The product's stated objective includes *uncompromising financial precision* (§2). Presentation is part of that: a number the operator misreads is a number the system got wrong. `apps/web/lib/formatters.ts` is the single implementation of every rule below — screens format through it, never inline.

**Locale is `id-ID` throughout.** Decimal comma, dot thousand separator.

| Kind | Rule | Example |
|---|---|---|
| Money | `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`, 0–2 fraction digits | `Rp 15.000` · `Rp 1.500.000` |
| Quantity | Up to 4 fraction digits, trailing zeros trimmed, optional unit appended | `1,5 kg` · `96 pcs` |
| Percentage | 0–2 fraction digits, `%` suffix; margin figures fixed at 1 decimal | `24,5%` · `31,2%` |
| Raw thousands (input display) | Dots as separators, comma before a meaningful decimal | `1.500.000,50` |
| Long date | `id-ID` with `timeZone: 'Asia/Jakarta'` | `Kamis, 20 Agustus 2026` |
| Table date/time | `toLocaleDateString('id-ID')` with time as a separate mono line | `20/08/2026` · `14:03` |

- **Absent is not zero.** A missing, empty, or unparseable value renders as an em dash `—`, never `0`, `NaN`, or a blank cell. Zero renders as zero.
- **The business day is Asia/Jakarta (WIB), not the browser's zone.** Every report range is pinned to it, so a device with a stale timezone must not be able to disagree about which day a sale belongs to.
- **Every numeral in the interface is *JetBrains Mono* with `tabular-nums`** (§5) — money, quantities, dates, identifiers, counts, page indicators. Serif is never used for numeric data (§25).
- Amounts that can legitimately be negative (gross profit, net cash flow) take the sign-based Flow Indicator rather than a direction enum (§12.2).

---
## 21. Content & Tone

Tone: concise, clear, confident, operational. The interface is a working instrument, not a brochure.

**Prefer explicit labels** naming the object and the action:

> Tambah Produk · Simpan Perubahan · Bayar · Batalkan Transaksi · Pilih Cabang · Export Laporan

**Avoid vague labels** when a specific one exists: *Manage, Process, Action, Continue, Submit*.

**Error messages must say two things:** what happened, and what the operator should do about it. An error that only states a failure leaves the person holding it with nowhere to go.

- Indonesian is the interface language; enum labels come from `lib/vocabulary.ts` so one status never reads two ways.
- Destructive confirmations state the scope of the consequence explicitly ("semua transaksi berstatus …"), not a generic "Are you sure?".

---
## 22. Accessibility & Compliance (WCAG 2.2 AA)

- All text meets minimum **4.5:1 contrast ratio** against its immediate background.
- Focus rings are styled with champagne gold glow (`rgba(197, 168, 128, 0.45)`), never suppressed.
- No status or movement indicator relies on color alone (always paired with labels, icons, or mathematical signs).
- Smooth CSS transitions (`150ms–200ms`) with full `@media (prefers-reduced-motion)` compliance.

---

---
## 23. Touch & Pointer Interaction

Interactive elements must support mouse, keyboard, and — where the surface is operational — touch.

- **Touch targets:** minimum 40×40px, 44×44px preferred for primary actions (Make Order, quantity steppers, delete icons). Minimum 8px between adjacent targets to prevent mis-taps.
- **Hover is never the only path.** A row action that appears only on hover must have a touch-accessible equivalent — always visible, or tap-to-reveal — on tablet and mobile.
- Touch interactions must not depend on precise pointer positioning.
- POS controls prioritise larger targets than back-office controls; density gives way to reliability where money is entered under time pressure.

---
## 24. Component Library Rules

**shadcn/ui defaults are not the visual source of truth.** Components may be built on its primitives, but their final treatment follows this document. OhMyPos tokens override the library's radius, shadow, colour, spacing, typography, and state styling.

**All screens share** one typography scale, colour semantics, spacing scale, radius scale, shadow scale, status semantics, interaction states, and navigation conventions.

- Do not introduce a local styling system for one screen.
- A screen-specific exception exists only when the workflow demands it, and is documented here rather than left in the code to be discovered.
- **Semantic tokens are not a style preference, they are what makes the dark theme work** — see §6.7 Building Components That Survive Both Themes. A literal colour anywhere in a component is a defect, not a shortcut.

---
## 25. Quality Gates & Anti-Patterns

### Strictly Prohibited:
1. Neon colors (e.g. cyan `#00BFFF`, neon purple `#7C3AED`, lime `#00FFBF`).
2. Heavy drop shadows, multi-colored glow, or blur-heavy glassmorphism.
3. Giant rounded pills (>12px radius) on cards, inputs, tables, or buttons.
4. Generic unstyled default library components.
5. Inconsistent typography (mixing unapproved fonts or using serif for numeric data).

---
