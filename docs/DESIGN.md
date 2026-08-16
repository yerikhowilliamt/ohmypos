OhMyPos — POS & Backoffice
1. Context and Mission

OhMyPos is a multi-branch F&B/retail POS and Backoffice web application.

The product serves:

Business owners
Administrators
Branch cashiers

The system covers:

POS / Sales Entry
Products and Master Data
Expenses and Purchases
Inventory
Reconciliation
Reporting
Multi-branch operations

The design must support operational work rather than marketing or content consumption.

The primary design objective is:

Make OhMyPos feel like a modern, premium, approachable POS and business operating system that is fast to use and easy to understand.

The design language is:

Soft Modern Retail SaaS + Modular POS UI

The product should feel visually related to modern restaurant/retail POS systems, while maintaining the information architecture and reliability of enterprise SaaS.

2. Design North Star
Core Principle

Soft outside, structured inside.

The interface should feel soft and approachable through:

light surfaces
rounded containers
subtle borders
restrained shadows
comfortable spacing
clean typography

The interface must remain operationally strong through:

predictable navigation
clear hierarchy
information density where required
strong table structure
explicit status
persistent POS context
fast primary actions

Visual polish must never reduce:

transaction speed
data comprehension
accessibility
accuracy
information density
operational clarity
3. Visual Reference
Primary Visual Reference

Use the following design as the primary visual direction:

Cloud Kitchen POS System Design — Dribbble

https://dribbble.com/shots/23059824-Cloud-Kitchen-POS-System-Design

The reference is used for:

overall visual tone
modular block composition
POS information hierarchy
product-card treatment
order/cart panel treatment
rounded UI language
light surface hierarchy
retail-oriented interaction patterns

The reference is not a specification for:

OhMyPos business logic
access control
domain entities
navigation permissions
data model
API behavior
exact dimensions
exact colors
exact component implementation

Do not copy the reference literally.

Use it as a visual north star and reinterpret it using the OhMyPos design tokens and domain requirements.

4. Product Design Character

OhMyPos combines three design characteristics.

4.1 Soft Modern

Use:

light backgrounds
white elevated surfaces
rounded containers
subtle borders
restrained shadows
comfortable whitespace
clean typography

Avoid:

neumorphism
excessive blur
excessive gradients
heavy glassmorphism
excessive pastel decoration
neon-heavy surfaces
4.2 Enterprise SaaS

Use:

structured navigation
predictable layouts
strong information hierarchy
professional data tables
clear filters
explicit status
operational dashboards
reliable interaction states
4.3 Retail UI

Especially for POS:

product-first interaction
category navigation
prominent search
product cards
persistent order/cart panel
quantity controls
strong payment action
touch-friendly targets
low cognitive load
5. Design Philosophy

The interface should visually communicate:

modern
trustworthy
premium
friendly
operational
efficient

It must not feel:

childish
overly corporate
generic ERP
overly futuristic
overly decorative
overly minimal
consumer-ecommerce-like

The intended impression is:

A premium tablet-friendly POS combined with a modern business management platform.

6. Information Density

Density must vary intentionally by screen.

Surface	Density	Priority
POS / Sales Entry	High	Speed
Dashboard	Medium	Awareness
Master Data	Medium-high	Management
Expenses & Purchases	Medium-high	Entry and tracking
Inventory	High	Monitoring
Reconciliation	High	Accuracy
Reports	Medium-low	Analysis

Do not apply one global density to the entire product.

7. Brand
Product
OhMyPos — POS & Backoffice
Audience
Business Owner
Admin
Branch Cashier
Product Surface
Web Application
Next.js frontend
NestJS backend
Monorepo
8. Typography
Font Family
font.family.primary = Plus Jakarta Sans
font.family.stack = Plus Jakarta Sans, Plus Jakarta Sans Fallback, ui-sans-serif, system-ui, sans-serif
font.family.mono = JetBrains Mono

Use Plus Jakarta Sans for:

navigation
labels
headings
buttons
descriptions
helper text
general UI

Use JetBrains Mono for:

prices
transaction totals
stock quantities
HPP
financial values
transaction identifiers
tabular numeric data
Base
font.size.base = 14px
font.weight.base = 400
font.lineHeight.base = 20px
Scale
font.size.xs = 12px
font.size.sm = 13px
font.size.md = 14px
font.size.lg = 16px
font.size.xl = 20px
font.size.2xl = 24px
font.size.3xl = 30px
Weight
font.weight.body = 400
font.weight.label = 500
font.weight.heading = 600
font.weight.strong = 700

Avoid excessive use of 700.

9. Color Tokens
Brand
color.brand.primary = #00BFFF

The brand color represents OhMyPos identity.

It should be used primarily for:

primary interactions
active states
selected controls
focus
brand accents

It must not dominate the entire interface.

Operational Accent
color.accent.inflow = #00B894
color.accent.outflow = #7C3AED
Inflow

Represents:

money in
stock in
positive movement
Outflow

Represents:

money out
stock out
outgoing movement
secondary movement emphasis
Status
color.status.success = #16A34A
color.status.warning = #F59E0B
color.status.danger = #EF4444
color.status.info = #7C3AED

Do not use neon #00FFBF as the default success color.

Text
color.text.primary = #0F172A
color.text.secondary = #334155
color.text.tertiary = #64748B
color.text.inverse = #FFFFFF
Surface
color.surface.base = #F8FAFC
color.surface.muted = #F1F5F9
color.surface.raised = #FFFFFF
color.surface.strong = #E0F6FF
color.surface.dark = #0F172A
Border
color.border.default = #E2E8F0
color.border.strong = #CBD5E1
Focus
color.focus.ring = rgba(0, 191, 255, 0.5)

All implementations must prefer semantic tokens over raw hex values.

10. Surface System

The UI should be composed from layered surfaces.

Recommended hierarchy:

Application background
↓
Section / container
↓
Card / panel
↓
Interactive element

Use:

surface.base for the main page background
surface.raised for cards and panels
surface.muted for secondary sections
surface.strong for selected or emphasized contextual surfaces

Hierarchy should be primarily communicated through:

surface
border
spacing
radius
shadow

Do not rely on shadow alone.

11. Radius System

Rounded UI is a core part of OhMyPos.

radius.xs = 6px
radius.sm = 8px
radius.md = 12px
radius.lg = 16px
radius.xl = 20px
radius.pill = 9999px
Usage
radius.xs
→ compact badges
→ compact table controls

radius.sm
→ buttons
→ inputs
→ selects

radius.md
→ standard cards
→ dialogs
→ tables

radius.lg
→ POS product cards
→ order/cart sections
→ major panels

radius.xl
→ major application sections
→ featured POS containers

radius.pill
→ status badges
→ category filters
→ tags
→ compact segmented controls

Do not use radius.pill for:

standard cards
dialogs
tables
application containers
12. Shadow System
shadow.1 = rgba(15, 23, 42, 0.06) 0px 1px 3px 0px
shadow.2 = rgba(15, 23, 42, 0.08) 0px 4px 12px 0px

Rules:

standard cards should use shadow.1
floating surfaces may use shadow.2
borders should remain present where appropriate
do not stack shadows
do not use glow
do not use colored shadows

The interface should feel clean and lightly elevated, not floating.

13. Spacing
space.1 = 4px
space.2 = 8px
space.3 = 12px
space.4 = 16px
space.5 = 24px
space.6 = 32px
space.7 = 40px
space.8 = 48px

Do not introduce arbitrary spacing values.

Use tighter spacing for:

data tables
POS rows
filters
related controls

Use larger spacing for:

page sections
major panels
unrelated groups
report sections
14. Motion
motion.duration.instant = 150ms
motion.duration.fast = 200ms
motion.duration.normal = 250ms

Motion must communicate state changes.

Use for:

hover
focus transitions
dropdowns
dialogs
drawers
cart updates
navigation transitions

Avoid:

bouncing
large scale animations
decorative transitions
unnecessary motion

Respect:

prefers-reduced-motion
15. Application Shell

The default desktop shell should use:

Sidebar ≈ 216px
Topbar ≈ 52px

Structure:

┌────────────────────────────────────────────────────┐
│ Sidebar │ Topbar                                   │
│         ├──────────────────────────────────────────┤
│         │                                          │
│         │ Page Header                              │
│         │                                          │
│         │ Main Content                             │
│         │                                          │
└────────────────────────────────────────────────────┘

The shell should remain visually light.

The sidebar must not visually overpower the content.

16. Sidebar

Use a light sidebar.

Characteristics:

white / raised surface
subtle border
compact navigation
restrained iconography
clear active state

Active navigation should use:

subtle brand-tinted surface
brand indicator
strong text

Avoid fully saturated backgrounds for the entire active item.

Navigation must be role-aware.

17. Topbar

The topbar may contain:

current page/context
branch context
user/account menu
relevant global actions

The branch context must always be understandable.

Owner / Admin

Use:

All Branches

or an allowed branch selector.

Cashier

Use:

Kemang · Terkunci

The cashier must not receive a branch-switch control.

18. Page Header

Every major page should establish a clear page header.

Recommended structure:

Page Title
Short contextual description if necessary
Primary Action
Optional filters / actions

Avoid long descriptive paragraphs.

Page headers should provide orientation, not decoration.

19. Dashboard

The dashboard should feel like an enterprise operational overview.

Recommended structure:

Page Header

KPI Summary

Primary Sales Overview

Secondary Operational Panels

Recent Activity / Action Required

KPI cards should contain:

label
primary value
supporting comparison
Flow Indicator where applicable

Do not create excessive KPI cards.

The dashboard should answer:

How is the business performing right now?

20. POS / Sales Entry

POS is the primary retail interface.

Its primary objective is:

Find product → add product → review order → pay.

The user must not need to navigate through unrelated application structures during checkout.

POS Layout

Use a modular three-zone structure where screen size permits:

┌────────────┬──────────────────────────┬──────────────────┐
│ Sidebar /  │ Categories + Search      │                  │
│ Navigation ├──────────────────────────┤ Order / Cart     │
│            │                          │                  │
│            │ Product Grid             │                  │
│            │                          │                  │
│            │                          │ Payment          │
└────────────┴──────────────────────────┴──────────────────┘

The exact dimensions may adapt responsively.

The conceptual structure must remain:

Navigation
+
Product Discovery
+
Persistent Order Context
21. POS Product Grid

Product cards are a primary visual component.

Each card should generally contain:

product image where useful
product name
price
optional supporting information
add/select action

Recommended characteristics:

radius.lg
raised white surface
subtle border
subtle shadow
consistent internal spacing
large click/touch area

Product cards must be easy to scan.

Do not overload cards with secondary information.

22. POS Categories

Categories should use compact rounded controls.

Example:

All
Food
Drinks
Coffee
Snacks
Desserts

Selected state should use a subtle brand or operational accent.

Categories should remain horizontally scannable where possible.

Avoid oversized navigation controls.

23. POS Search

Search is a first-class control.

It must be:

easy to locate
keyboard accessible
fast
visually prominent
touch-friendly

Support:

product name
supported product identifier
empty state
no-result state
loading state
24. POS Order / Cart Panel

The order panel is a first-class component.

It should remain visible on desktop POS where layout allows.

The order panel must communicate:

selected items
quantity
line subtotal
adjustments
subtotal
discount where applicable
final total

The panel must feel visually distinct without becoming visually heavy.

25. POS Quantity Controls

Quantity controls must be easy to use with:

mouse
keyboard
touch

The user should be able to:

increment
decrement
remove item
view current quantity

Controls should not require precision clicking.

26. POS Payment Action

The payment action is the strongest action in the POS.

It must be:

prominent
easy to find
touch-friendly
keyboard accessible
visually distinct

The final payable amount should be highly visible.

Do not hide payment inside an overflow menu.

27. POS Empty States

Empty cart state must clearly explain:

no items selected
what the user can do next

Example:

Your order is empty
Select a product to start the transaction.

Avoid decorative empty-state illustrations that consume significant screen area.

28. Backoffice Data Tables

Data tables are core enterprise components.

They must support where applicable:

search
filtering
sorting
pagination
row actions
empty states
loading states
error states

Table structure should prioritize:

identification
primary business value
status
context
action

The outer table container may use radius.md.

Do not over-round each row or cell.

Numeric values should generally be right-aligned.

29. Master Data

Master Data screens should use:

Page Header
↓
Search / Filters
↓
Primary Action
↓
Data Table
↓
Pagination

Density should be moderate-high.

The user should be able to scan large datasets efficiently.

30. Expenses & Purchases

Expenses & Purchases should support operational entry and review.

Include:

date
category
amount
branch context
source
status where applicable
row actions

The Central / Branch distinction must use an explicit semantic tag.

CENTRAL
BRANCH

Do not rely on color alone.

31. Central / Branch Purchase Tag

The component must visually distinguish:

CENTRAL

and:

BRANCH

Recommended treatment:

pill radius
subtle tinted background
readable label
optional icon if useful

The tag must remain understandable without color.

32. Inventory

Inventory screens must prioritize:

current stock
stock movement
stock status
branch
last update
actions

Low stock must be noticeable without overwhelming the screen.

Use:

warning badge
supporting label
numeric emphasis

Avoid giant red warning panels for normal inventory warnings.

33. Stock / Makeable Quantity

The POS must not invent stock or HPP behavior that conflicts with the domain model.

Where applicable, POS may display derived advisory makeable quantity.

HPP must follow the binding domain documentation.

The UI must not present moving-average costing if the domain model does not support it.

34. Reconciliation

Reconciliation must use a precise financial layout.

The interface should clearly communicate:

Bank Transaction
Allocated
Remaining

Example:

Bank Transaction
Rp 1.500.000

Allocated
Rp 1.200.000

Remaining
Rp 300.000

Use JetBrains Mono for financial amounts.

35. Bank Transaction Split-Allocation Widget

The widget must provide:

source transaction
original amount
allocation rows
allocated total
remaining amount
validation

The remaining amount must be immediately understandable.

The component must prevent invalid allocation states.

36. Reports

Reports should be more spacious than operational screens.

Use:

clear filters
KPI summaries
charts
tables
export action
date and branch context

Charts should be analytical, not decorative.

Avoid fake or arbitrary metrics.

37. Flow Indicator

Flow Indicator is a shared signature component.

Use it wherever movement is represented:

revenue
stock
money in
money out
comparative financial values
income by payment method

Use:

inflow  → color.accent.inflow
outflow → color.accent.outflow

The visual treatment must remain consistent across screens.

Do not introduce bespoke movement indicators.

38. Forms

Forms must use:

Label
Input
Helper text / Validation

Inputs should generally use:

radius.sm

Forms must provide:

visible labels
validation states
clear required state
keyboard support
touch support

Placeholder text must not replace labels.

39. Buttons
Primary

Use for the most important action.

Examples:

Save
Create
Pay
Confirm
Submit
Secondary

Use neutral treatment.

Examples:

Cancel
Filter
Export
Reset
Destructive

Use danger semantics.

Examples:

Delete
Void
Remove

Buttons must define:

default
hover
focus-visible
active
disabled
loading
error where applicable
40. Status Badges

Use semantic status badges for:

Paid
Pending
Failed
Cancelled
Completed
Low Stock

Characteristics:

pill radius
subtle tinted background
readable label
optional icon

Never communicate status using color alone.

41. Responsive Design

The primary target is desktop and laptop web applications.

Also support:

tablet
touch devices

Do not simply scale down the desktop layout.

POS

On narrower layouts:

preserve search
preserve product discovery
prioritize cart context
preserve primary payment action
reduce secondary content
Backoffice

On narrower layouts:

prioritize primary columns
allow horizontal table scrolling where appropriate
collapse secondary controls
preserve comprehension

Do not convert every table into a card stack if doing so makes comparison harder.

42. Accessibility

Target:

WCAG 2.2 AA

Keyboard

All interactive elements must be keyboard accessible.

Required:

logical tab order
visible focus
keyboard activation
escape behavior for dismissible overlays
appropriate keyboard interaction for menus and composite widgets
Focus

Never suppress focus indicators.

Use:

color.focus.ring
Contrast

All applicable text and interactive states must satisfy WCAG 2.2 AA.

Pay special attention to:

tertiary text
muted text
tinted backgrounds
brand-colored buttons
status badges
disabled states
Color Independence

Do not rely on color alone for:

success
danger
warning
inflow
outflow
branch type
transaction state
43. Touch and Pointer Interaction

Interactive elements must support:

mouse
keyboard
touch where relevant

POS controls should prioritize larger touch targets.

Touch interactions must not depend on precise pointer positioning.

Hover must never be the only way to expose critical information or functionality.

44. Component State Rules

Every interactive component must define:

default
hover
focus-visible
active
disabled
loading
error

Where applicable also define:

selected
checked
expanded
collapsed
empty
success
warning

State changes must preserve layout stability wherever practical.

45. Content and Tone

Tone:

concise, clear, confident, operational.

Prefer explicit labels.

Use:

Tambah Produk
Simpan Perubahan
Bayar
Batalkan Transaksi
Pilih Cabang
Export Laporan

Avoid vague labels such as:

Manage
Process
Action
Continue
Submit

when a more specific action is available.

Error messages should explain:

what happened
what the user should do
46. Anti-Patterns
Visual

Do not use:

excessive gradients
neon-heavy UI
heavy glassmorphism
neumorphism
excessive blur
glowing effects
multiple shadow layers
inconsistent radius
arbitrary colors
arbitrary spacing
excessive pills
excessive animations
decorative illustrations with no operational purpose
Layout

Do not use:

dashboard layouts made entirely from cards
excessive empty space in operational screens
overly dense POS screens
overly sparse Backoffice screens
nested containers without purpose
oversized hero sections
unrelated decorative sections
POS

Do not:

hide payment
hide cart
bury search
make touch controls tiny
require unnecessary navigation
overload product cards
add decorative content that competes with transaction flow
Backoffice

Do not:

hide important data unnecessarily
overuse cards instead of tables
create decorative dashboards
make operational tables difficult to scan
hide branch context
create unnecessary visual noise
47. Shadcn / Component Library Rules

The default shadcn/ui styling must not be treated as the visual source of truth.

OhMyPos tokens override:

radius
shadow
colors
spacing
typography
states

Components may be based on shadcn/ui primitives, but their final visual treatment must follow this document.

48. Design System Consistency

All screens must share:

typography
color semantics
spacing scale
radius scale
shadow scale
status semantics
interaction states
navigation conventions

A screen-specific exception should only exist when the workflow justifies it.

Do not introduce local styling systems.

49. Domain-Specific Components

The following components are part of the OhMyPos design system and must be designed explicitly:

Flow Indicator
Branch Selector
Cashier Fixed Branch Badge
POS Product Card
POS Cart
POS Payment Action
Bank Transaction Split-Allocation Widget
Central / Branch Purchase Tag
Inventory Stock Status
Financial KPI Card

These are domain components, not generic library components.

50. Role-Aware Visual Behavior
Owner

May have:

branch selector
global dashboard context
reporting
cross-branch information
Admin

May have:

operational management
master data
inventory
expenses
reconciliation
branch-scoped or permitted branch context
Cashier

Must have:

POS / Sales access
fixed branch context

Cashier must not receive navigation that contradicts the binding access-control documentation.

51. Mockup as Reference

An approved mockup exists in Claude Design:

Project:
bf321a39-26cf-49bc-b774-c75783ebdf2f

Files:
OhMyPos App.dc.html
Sales Entry.dc.html

The mockup covers:

Login
Application shell
Dashboard
Penjualan / POS
Data Master
Pengeluaran
Stok & Inventori
Rekonsiliasi
Laporan

Shell reference:

Sidebar ≈ 216px
Topbar ≈ 52px

Status:

Reference, not specification.

Use the mockup to understand:

visual hierarchy
layout
density
anatomy
interaction patterns

Do not treat it as authority for:

access control
domain model
business rules
API behavior
exact content
52. Mockup vs Binding Documentation

The following decisions are binding.

Mockup	Binding documentation	Resolution
text.primary #020817	This document: #0F172A	This document wins
surface.base #F1F5F9	This document: #F8FAFC	This document wins
Owner / Cashier only	ADR-011 defines three roles	ADMIN uses the same visual language
Cashier sees Data Master / Stock	System Design v4 restricts KASIR to POS/Sales	Binding documentation wins
Branch selected during login	ADR-011: branch comes from User.branchId	Binding documentation wins
PIN Kasir	ADR-011: email + password	Binding documentation wins
Product stock on POS	ADR-004 / ADR-005 / ADR-013	Follow domain model
Moving-average HPP	ADR-004 / ADR-005 / ADR-013	Do not present unsupported costing
Mockup-specific warning foreground	No binding semantic token	Use documented warning system

Do not modify implementation to match the mockup where it conflicts with binding documentation without a new ADR.

53. Guideline Authoring Workflow

When creating new UI guidance:

State the design intent.
Identify the applicable surface.
Use the defined tokens.
Define component anatomy.
Define variants.
Define interaction states.
Define responsive behavior.
Define accessibility behavior.
Define edge cases.
Define anti-patterns.
Define QA acceptance criteria.
54. Quality Gates

Every non-negotiable rule must use:

must

Every recommendation must use:

should

Every accessibility requirement must be testable.

Every design token must have a clear purpose.

Every component should use existing tokens rather than introducing local values.

System consistency must be preferred over local visual exceptions.

55. QA Checklist
Visual

Soft Modern visual direction is present.

Enterprise SaaS information hierarchy is preserved.

Retail UI patterns are obvious in POS.

Rounded UI is consistent.

Cards and panels use the correct radius.

Shadows remain subtle.

No unnecessary gradients exist.

Colors follow semantic tokens.

Typography follows the defined scale.

POS

Product discovery is fast.

Search is prominent.

Categories are easy to scan.

Product cards are touch-friendly.

Cart remains visible where layout permits.

Total is highly visible.

Payment action is obvious.

POS does not contain unnecessary dashboard decoration.

Backoffice

Tables remain readable.

Information density is appropriate.

Filters are discoverable.

Branch context is explicit.

Reports have appropriate breathing room.

KPI cards remain useful rather than decorative.

Accessibility

WCAG 2.2 AA contrast passes.

Keyboard navigation passes.

Focus indicators remain visible.

Touch interactions are reliable.

Status does not rely on color alone.

Reduced-motion behavior is supported.

Consistency

No arbitrary colors.

No arbitrary spacing.

No arbitrary radius.

No one-off shadow systems.

Shared components use shared states.

Domain components follow their documented behavior.

56. Final Design Definition

The final OhMyPos visual system is:

                 OhMyPos
                    │
        ┌───────────┴───────────┐
        │                       │
     POS UI                Backoffice UI
        │                       │
 Retail-first              Enterprise SaaS
 Product-centric            Data-centric
 Cart-centric               Table-centric
 Touch-friendly             Information-dense
        │                       │
        └───────────┬───────────┘
                    │
             Shared Design System
                    │
      Soft Modern + Rounded + Modular
                    │
             Light / Clean / Premium

The resulting product should feel:

Modern enough to be exciting, structured enough to be trusted, and fast enough to be used all day by a cashier or operator.

The visual reference establishes the direction, while this document remains the authoritative source for OhMyPos implementation.