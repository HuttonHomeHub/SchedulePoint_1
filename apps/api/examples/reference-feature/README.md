# Reference feature — the canonical template

> **This is the canonical implementation standard for new features**, kept as a
> template to copy — not part of the running application. It is excluded from the
> build, the app module, linting, and database migrations (**ADR-0014**), but it
> **is CI-verified** so it can't rot (**ADR-0015**). Full guidance:
> [`docs/REFERENCE_FEATURE.md`](../../../../docs/REFERENCE_FEATURE.md).

## Status

- **Not shipped.** Nothing here runs in the API; the live schema has no models.
- **CI-verified.** `scripts/verify-template.sh` (and the "Verify feature template"
  CI job) materialise this template into the app, generate the Prisma client,
  **type-check it, and run its unit tests** on every push. Run it locally with
  `bash scripts/verify-template.sh`.

## Layout

```text
reference-feature/
├── module/
│   ├── reference.module.ts         # DI wiring: controller → service → repository
│   ├── reference.controller.ts     # HTTP surface (thin)
│   ├── reference.service.ts        # Business logic / use cases
│   ├── reference.repository.ts     # Data access — the only Prisma consumer
│   ├── reference.service.spec.ts   # Unit tests (repository mocked)
│   ├── reference-permissions.ts    # Permission codes + role→permission map
│   └── dto/                        # Request + response DTOs
├── reference.e2e-spec.ts           # API e2e (Supertest + real Postgres)
└── schema.reference.prisma         # Model sketch to copy into prisma/schema.prisma
```

## How to use it

See the step-by-step in
[`docs/REFERENCE_FEATURE.md`](../../../../docs/REFERENCE_FEATURE.md) → _Creating a
new feature from the template_. In short: run the delivery process first, copy
`module/` into `src/modules/<feature>/`, add the model + migration, define
permissions, register the module, adapt the tests to green, and update the docs.

## What it demonstrates

Layered controller → service → **repository**; validated DTOs; standard
`{ data, meta }` / `{ error }` envelopes; cursor pagination + filtering + sorting;
RBAC with **organisation-scoped** authorisation (anti-IDOR); soft delete; auditing;
optimistic locking; structured logging with correlation IDs; typed config; and
unit + API (Supertest) tests. The standard-by-standard map, plus frontend and
security/performance guidance, is in
[`docs/REFERENCE_FEATURE.md`](../../../../docs/REFERENCE_FEATURE.md).
