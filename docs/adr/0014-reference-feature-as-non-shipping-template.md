# ADR-0014: Reference feature as a non-shipping template

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Principal Engineer, Technical Lead (repository readiness review)

## Context

During backend architecture setup we built a fully-working, tested **reference
feature** (`ReferenceItem` — module, Prisma model, migration, unit + e2e tests)
to prove the architecture end-to-end and to serve as the template for future
features (see [`docs/REFERENCE_FEATURE.md`](../REFERENCE_FEATURE.md)). It did its
job: the stack was validated (13 unit + 6 API e2e tests green against real
Postgres at commit `08ff6fe`).

Before real application development begins, the readiness review must decide its
fate. Leaving it as-is means the **real product ships a `reference_items` table
and `/api/v1/reference-items` endpoints** that are not a real feature — a phantom
that would later need a drop-migration and could confuse contributors ("is this
a feature?"). Removing it entirely would discard a valuable, concrete example.

Options considered (the review's default: _keep only if it demonstrates patterns
future developers should follow; remove if it adds complexity or confusion_):

1. **Keep as a permanent, live example** — tested and always-green, but ships the
   phantom table/endpoints into the product.
2. **Remove entirely** — cleanest schema, but loses the concrete worked example.
3. **Convert to a non-shipping template** — keep the code as a reference to copy,
   but exclude it from the build, the app module, and migrations.

## Decision

**Option 3.** The reference feature is retained as a **non-shipping template** at
[`apps/api/examples/reference-feature/`](../../apps/api/examples/reference-feature/):

- **Not shipped:** it is not registered in `AppModule`, not compiled into the
  build (it lives outside `src/`), and excluded from lint/type-check
  (`apps/api/eslint.config.mjs` ignores `examples/**`; it is outside the api
  `tsconfig` include).
- **Not in the database:** the `ReferenceItem` model and its migration were
  removed. The live schema has **no domain models**, so the first real feature
  writes the first migration. The model is preserved as a sketch
  (`schema.reference.prisma`) for copying.
- **Auth model genericised:** the RBAC `Permission` type is now a feature-
  agnostic `string` and the principal carries resolved permissions per
  membership. The reference-specific role→permission mapping moved into the
  template (`reference-permissions.ts`), so shipping infrastructure no longer
  hardcodes a removed feature's permissions.
- **The API stays tested:** a unit test of the retained RBAC model
  (`principal.spec.ts`) keeps CI meaningful; Supertest remains the ready API-e2e
  toolchain.

## Consequences

- **Positive:** clean starting point — no phantom table/endpoints, a modelless
  schema, and honest shipping code; the worked example (and the standard-by-
  standard map in `docs/REFERENCE_FEATURE.md`) is still one copy away.
- **Negative / trade-offs:** the template is **not CI-verified** (it references a
  `ReferenceItem` model absent from the live client), so it can drift. Mitigation:
  the README marks commit `08ff6fe` as the verified snapshot and instructs
  re-verification after adapting; the reusable infrastructure it demonstrated
  (config, Prisma, guards, filters, interceptors, health, bootstrap) remains
  live and tested as the authoritative reference.
- When the first real feature lands, consider deleting the template if it has
  served its purpose.

## References

- [`docs/REFERENCE_FEATURE.md`](../REFERENCE_FEATURE.md),
  [`apps/api/examples/reference-feature/README.md`](../../apps/api/examples/reference-feature/README.md),
  ADR-0008 (modular monolith), ADR-0012 (RBAC)
