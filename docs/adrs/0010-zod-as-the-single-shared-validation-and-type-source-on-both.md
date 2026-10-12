# ADR-010: Zod as the single shared validation and type source, on both backend and frontend
 
**Status:** Accepted (supersedes ADR-009)
 
**Context:** ADR-009 assumed hand-written TypeScript types kept in sync with the backend by developer discipline alone — types with no attached runtime validation, and a design that requires remembering to update both sides on every change. Separately, NestJS's default validation approach (`class-validator` + `class-transformer` DTOs) is itself just another type definition that would need to stay in sync with whatever `packages/api-contracts` declares — a third place for the same shape to drift.
 
**Decision:** Define every request/response shape once, as a Zod schema, in `packages/api-contracts`. Both `apps/api` and `apps/web` import these schemas directly:
- **Backend**: use the Zod schemas for request validation (replacing `class-validator` DTOs), so an invalid request is rejected using the exact same rule the frontend was built against.
- **Frontend**: use the same Zod schemas for form/input validation before a request is even sent, giving immediate feedback with zero duplicate rule-writing.
- TypeScript types are derived from the schemas via `z.infer<typeof schema>` — the type is a byproduct of the validation rule, not a separate artifact to maintain.
**Consequences:**
- Eliminates type drift *by construction*, not by discipline — closes the exact gap ADR-009 left open as a risk.
- One less concept to hold in your head: no separate DTO classes on the backend, no separate hand-written interface on the frontend, no OpenAPI generation step — just Zod schemas, imported.
- Validation error messages can be shared/consistent across backend rejections and frontend form errors, since they come from the same schema definitions.
- Requires picking a NestJS-side integration approach for wiring Zod into the request pipeline (e.g. a custom `ZodValidationPipe` or an existing library such as `nestjs-zod`) — a small implementation detail to settle when `apps/api` scaffolding begins, not architecturally significant enough for its own ADR.
**Alternatives considered:**
- *ADR-009's hand-written types*: superseded — see Context above.
- *`class-validator` DTOs on the backend + separately hand-written or generated frontend types*: rejected — this is effectively two sources of truth for the same shape (or three, counting the frontend), which is exactly the drift risk Zod avoids by being usable directly on both ends.
