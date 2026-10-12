# @ohmypos/config

Shared lint, format and TypeScript presets for every workspace (Playbook §2, §13). Rules and Prettier values come from Kasync, so ported code is checked against the config it was written for.

| Export | For | Notes |
|---|---|---|
| `eslint/base` | Baseline | `no-explicit-any` is an **error** (AGENTS.md: never use `any`). Ignores emitted declarations and the generated Prisma client. Takes `tsconfigRootDir` (normally `import.meta.dirname`) so typed linting resolves each package's own tsconfig |
| `eslint/nest` | `apps/api` | Baseline plus Jest globals and CommonJS |
| `eslint/next` | `apps/web` | **Overrides only, not a full baseline.** Next's own configs already register typescript-eslint, and registering it twice collides. `apps/web` composes Next's configs first, then spreads this; Next's config stays a dependency of `apps/web` because it is version-locked to Next |
| `eslint/package` | `packages/api-contracts`, `packages/ui` | Currently equal to the baseline; it exists so framework-free packages never import the Nest or Next preset |
| `prettier` | All | Kasync's values |
| `typescript/{base,nest,next,library}.json` | All | Presets omit `outDir`/`rootDir`, because relative paths in an extended tsconfig resolve against the preset's directory. Each package declares its own |
