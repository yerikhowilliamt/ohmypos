# OhMyPos — POS & Backoffice Design System

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

A dark theme exists for night-shift back-office use (`(back-office)` route group — ADMIN/OWNER only). It is **not** a general dark-mode toggle: POS and the shared routes (profile/help/leave-requests, reachable by KASIR) never render it, by construction — see System Design/AppShell's `enableDarkMode` prop. It reuses the Obsidian surfaces already defined for the POS dark order-panel option (§9.4) as its base and applies under a `[data-theme="dark"]` scope on the back-office shell, not on `<html>`/`<body>`.

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

Typography, spacing, radius, and motion tokens are unchanged in dark mode.

---

## 7. Micro-Radius & Elevation System

### 7.1 Radius Scale (Sharp & Refined)
Avoid bubbly, high-radius components. Shapes must feel architectural and precise.
```css
radius.xs   = 2px   /* Micro tags, inner indicators */
radius.sm   = 4px   /* Buttons, inputs, dropdown triggers, stepper controls */
radius.md   = 6px   /* Standard cards, dialogs, table containers */
radius.lg   = 8px   /* POS product cards, major panels */
radius.xl   = 12px  /* Application shell containers */
radius.pill = 9999px/* Reserved ONLY for status dots / micro status pills */
```

### 7.2 Elevation & Shadows
Elevations rely on hairline 1px borders and micro-ambient occlusion.
```css
shadow.1 = 0px 1px 2px 0px rgba(24, 24, 27, 0.04)  /* Standard Card */
shadow.2 = 0px 4px 16px -2px rgba(24, 24, 27, 0.08) /* Floating Modal / Dropdown */
```
*Rule:* Never apply heavy drop shadows or colored neon glows.

---

## 8. Application Shell & Navigation

### 8.1 Desktop Layout Anatomy
- **Backoffice:** Fixed Warm Alabaster Sidebar (≈ 220px) + Compact Topbar (≈ 50px) + Content Canvas.
- **POS / Sales Entry:** Three-Zone Full-Height Layout (Sidebar / Product Discovery / Obsidian Order Panel).

### 8.2 Sidebar Specifications
- **Surface:** `#FFFFFF` or `#FBF9F5` with right hairline border (`#EAE4DC`).
- **Brand Mark:** Display font in `#18181B` with Gold Accent emblem.
- **Active Navigation Item:**
  - Background: `color.surface.strong` (`#F7F2EA`)
  - Left border accent or text: `color.brand.primary` (`#C5A880`) / `#18181B`
  - Font weight: `600 (Semibold)`
- **Account Card:** Bottom-pinned subtle container displaying user avatar, name, and role badge (`OWNER`, `ADMIN`, `KASIR`).

### 8.3 Topbar Specifications (Backoffice)
- **Height:** 50px.
- **Components:** Branch Selector (or fixed badge for Cashier), Date Range Context, Profile & Notification trigger.

---

## 9. POS / Sales Transaction Architecture

### 9.1 Three-Zone POS Layout
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

### 9.2 Product Grid & Cards
- **Card Surface:** Pure white (`#FFFFFF`) with 1px border (`#EAE4DC`).
- **Image Frame:** 1:1 or 4:3 ratio with crisp, edge-to-edge photography and subtle warm grading.
- **Typography:** Product Title in *Plus Jakarta Sans*, Price in *JetBrains Mono* with gold tint (`#C5A880`) or rich charcoal.
- **Active / Selected State:** 1.5px Champagne Gold outline (`#C5A880`).
- **Add Product Card:** First slot in grid with dashed warm stone border (`#D6CDBF`) and centered gold "+" icon.

### 9.3 Category Filter Row
- Presented as horizontal count cards (not bubbly pills).
- Displays category title and item count (e.g. `Beverage / 24 items`).
- Active State: Gold border with `#F7F2EA` background.

### 9.4 Order Panel (Right Rail)
- May use rich contrasting Obsidian Slate (`#12151B`) or Crisp Warm Ivory.
- **Line Items:** Product thumbnail, quantity stepper, unit price, and JetBrains Mono line total.
- **Summary:** Subtotal, Service Tax (10%), and prominent Total Amount.
- **Payment Method:** Sleek select box (Cash, Card, QRIS, Bank Transfer).
- **Primary CTA ("Make Order"):** Full-width, high-contrast button in `#C5A880` (Gold text/fill) or `#18181B` with Gold border.

---

## 10. Backoffice Data Tables & Financial Screens

### 10.1 Data Table Rules
- **Header:** Uppercase 11px *Plus Jakarta Sans* (`font-semibold`, tracking-wide) with `#F4EFEB` background and `#D6CDBF` bottom divider.
- **Rows:** Alternating subtle hover state (`#FBF9F5`), 1px bottom divider (`#EAE4DC`).
- **Numbers & Dates:** Right-aligned *JetBrains Mono* (`tabular-nums`).
- **Sticky Column:** Primary identifier (e.g. Product Name, Transaction Ref) remains sticky on horizontal overflow.

### 10.2 Signature Flow Indicator
Used across all revenue, expense, and reconciliation displays:
- **Inflow (Money In / Stock In):** Deep Imperial Emerald (`#166534`) accompanied by `+` or subtle upward chevron.
- **Outflow (Money Out / Stock Out):** Muted Regal Rosewood (`#9F1239`) accompanied by `-` or subtle downward chevron.

### 10.3 Bank Reconciliation Split-Allocation
- Visual balance check: Total Amount = Allocated + Remaining.
- Remaining amount in *JetBrains Mono* highlighted in amber if unallocated, emerald when zero.
- Prevents invalid allocations with clean inline alerts.

---

## 11. Responsive Breakpoints

```css
breakpoint.desktop = ≥1280px   /* Full 3-zone layout */
breakpoint.laptop   = 1024–1279px /* Compact 3-zone layout */
breakpoint.tablet    = 768–1023px  /* Collapsed sidebar rail (64px), 3-col grid */
breakpoint.mobile    = <768px      /* Full-width catalog + Slide-up Order Sheet */
```

- **Touch Targets:** Minimum 44×44px for primary POS controls (steppers, category cards, CTAs).
- **Mobile POS:** Persistent bottom floating summary bar (`3 items · Rp 185.000`) that expands to full order review sheet in 1 tap.

---

## 12. Accessibility & Compliance (WCAG 2.2 AA)

- All text meets minimum **4.5:1 contrast ratio** against its immediate background.
- Focus rings are styled with champagne gold glow (`rgba(197, 168, 128, 0.45)`), never suppressed.
- No status or movement indicator relies on color alone (always paired with labels, icons, or mathematical signs).
- Smooth CSS transitions (`150ms–200ms`) with full `@media (prefers-reduced-motion)` compliance.

---

## 13. Quality Gates & Anti-Patterns

### Strictly Prohibited:
1. Neon colors (e.g. cyan `#00BFFF`, neon purple `#7C3AED`, lime `#00FFBF`).
2. Heavy drop shadows, multi-colored glow, or blur-heavy glassmorphism.
3. Giant rounded pills (>12px radius) on cards, inputs, tables, or buttons.
4. Generic unstyled default library components.
5. Inconsistent typography (mixing unapproved fonts or using serif for numeric data).
