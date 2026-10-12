# @ohmypos/ui

Shared shadcn/ui components and the design tokens from [`docs/design.md`](../../docs/design.md), consumed by `apps/web`.

| Export | Source |
|---|---|
| `@ohmypos/ui/globals.css` | `src/styles/globals.css`: Tailwind v4 theme variables (the design.md tokens) |
| `@ohmypos/ui/components/<name>` | `src/components/ui/<name>.tsx` |
| `@ohmypos/ui/lib/<name>` | `src/lib/<name>.ts` (`cn`, `portal-container`) |

Components are added with the shadcn CLI in monorepo mode (`components.json`). Adding one can pull in a new dependency, so it goes through the dependency-approval gate (AGENTS.md).

## Local adaptations of shadcn/ui

| Component | Deviation from upstream | Why |
|---|---|---|
| `sidebar` | `isMobile` and `open`/`onOpenChange` are always controlled by the caller; nothing is persisted to a cookie; no keyboard shortcut | Breakpoints have one source of truth (`apps/web/hooks/useMediaQuery.ts`). The rail/expanded switch is forced by breakpoint, not a user preference, so a toggle shortcut would do nothing |
| `dialog` | `showCloseButton` prop (default `true`) | For the one non-dismissable dialog shape (`SuspendedTenantDialog`), where closing would only hide the explanation. The caller must also block Escape and outside clicks |
| `accordion` | No open/close animation | No accordion keyframes or animation plugin exist in the repo. Adding animation classes first needs that plugin, which is a new dependency |
| `calendar` | Fixed 6-week grid (49 cells) | The height never changes between months, which keeps popover positioning stable |
| `currency-input` | Indonesian formatting (`1.500.000,50`) | An all-zero fraction is hidden, so a 6dp unit cost (ADR-024) reads `10.000`, not `10.000,000000`. A real or partially typed fraction is kept as typed |

`lib/portal-container.ts`: Radix portals mount into `document.body` by default, outside any `data-theme` scope. Back-office dark mode provides a themed container through this context; the default `null` keeps Radix's behavior.
