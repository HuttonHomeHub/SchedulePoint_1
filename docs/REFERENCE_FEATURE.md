# Implementation Standard — how a feature is shaped

> **This is the canonical implementation standard for the project.** Every
> backend feature follows the layering, envelopes, authorisation, validation,
> logging and testing described here. Diverging from these cross-cutting patterns
> requires a documented architectural reason — an ADR.
>
> There is no longer a template to copy. Until 2026-07-27 this document described
> a synthetic `ReferenceItem` feature kept under CI as the mandatory starting
> point (ADR-0014/0015). With 19 real modules built to this standard, that
> scaffold taught less than the code it modelled and cost more to maintain, so it
> was deleted — see [ADR-0057](adr/0057-real-modules-replace-the-reference-template.md).
> **Read a real module instead.**

## The exemplars

Three modules, in the order you are likely to need them:

| Read                                                  | For                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`modules/clients`](../apps/api/src/modules/clients/) | **The canonical shape.** Controller → service → repository, DTOs, org scoping, soft delete, optimistic locking. The smallest complete instance of this standard. |
| [`modules/notes`](../apps/api/src/modules/notes/)     | **The richer instance.** A polymorphic parent with a fail-closed CHECK, a plan-cascade sweep, author-ownership checks (ADR-0046).                                |
| [`modules/share`](../apps/api/src/modules/share/)     | **The auth boundary.** A parallel principal type, a token guard, uniform-404 resolution, rate limiting (ADR-0051).                                               |

## When to use this document

- **Every new backend feature** (a new resource/capability with endpoints and/or
  persistence) matches the anatomy below. Start from the nearest exemplar.
- Use the exemplars for the shape — layers, naming, error/response envelopes,
  authz, tests — not the domain content.
- For **frontend features**, follow the [frontend feature anatomy](#frontend-feature-template)
  section below plus [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) and
  [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md).
- Don't apply it to one-off scripts, infra, or pure refactors.

---

## Backend feature anatomy

### Recommended folder structure

A feature is one self-contained module under `apps/api/src/modules/<feature>/`:

```text
modules/<feature>/
├── <feature>.module.ts          # DI wiring (controller, service, repository)
├── <feature>.controller.ts      # HTTP surface (thin)
├── <feature>.service.ts         # Business logic / use cases
├── <feature>.repository.ts      # Data access (the only Prisma consumer)
├── <feature>.service.spec.ts    # Unit tests (mock the repository)
├── <feature>-permissions.ts     # This feature's permission codes + role map
└── dto/
    ├── create-<entity>.dto.ts        # Request DTOs (class-validator + OpenAPI)
    ├── update-<entity>.dto.ts        # includes `version` (optimistic lock)
    ├── list-<entity>-query.dto.ts    # pagination + filter + sort
    └── <entity>-response.dto.ts      # safe response shape (no internal columns)
```

The API-level (integration/e2e) test lives in `apps/api/test/<feature>.e2e-spec.ts`.

### Module organisation & dependency injection

- One **NestJS module per feature** (`@Module`). It wires the controller,
  service, and repository as providers; Prisma comes from the global
  `PrismaModule`. Export the service only if another module legitimately needs it.
- **Constructor injection** throughout (DI). Depend on the abstractions the app
  provides (`PrismaService`, `PinoLogger`, guards) — never instantiate them.
- **Dependency rule:** controller → service → repository. Nothing depends on the
  controller; the repository is the only layer that touches Prisma (ADR-0008).

### File & symbol naming conventions

- Files: `kebab-case` (`create-client.dto.ts`). Classes/types: `PascalCase`.
  Providers: `‹Feature›Controller` / `‹Feature›Service` / `‹Entity›Repository`
  — note the repository is singular after its entity (`client.repository.ts`,
  `note.repository.ts`), the controller and service plural after the feature
  (`clients.controller.ts`). DTOs: `‹Action›‹Entity›Dto` / `‹Entity›ResponseDto`
  (`create-client.dto.ts`, `client-response.dto.ts`). Permission codes:
  `‹resource›:‹action›` (`client:create`). See `CLAUDE.md §5`.

### Controller pattern (thin)

`clients.controller.ts` — HTTP only: routing, versioned path
(`@Controller({ path, version: '1' })`), DTO binding, `@RequirePermissions(...)`,
status codes (`@HttpCode`), OpenAPI decorators, and mapping entities to
**response DTOs**. **No business logic.** Injects the authenticated principal via
`@CurrentUser()`. Lists return a `Paginated<…>` (rendered as `{ data, meta }`);
items return the resource (wrapped as `{ data }`) by the global interceptor.

### Service pattern (business logic)

`clients.service.ts` — orchestrates the use case: **authorise → apply rules →
delegate persistence to the repository → log**. Owns transaction boundaries when
a use case spans multiple writes. Throws typed **domain errors** (never HTTP
exceptions). Contains no raw Prisma and no HTTP concerns.

### Repository / data-access pattern

`client.repository.ts` — the **only** Prisma consumer for the feature. It
encapsulates queries and **centralises the soft-delete filter** (`deletedAt:
null`) so no caller can forget it, exposes an optimistic-locked update
(`updateIfVersionMatches` → row count), and keeps pagination query shape in one
place. Swapping the ORM would touch only this file.

### Validation

Request DTOs use **`class-validator`** decorators; the global `ValidationPipe`
(`whitelist`, `forbidNonWhitelisted`, `transform`, 422 on failure) enforces them
and rejects unknown fields. Types/ranges/lengths/formats are constrained on every
field. Money (if any) is integer minor units; UUIDs validated version-agnostically
(`UUID_REGEX`). See [`API.md`](API.md).

### Error handling

Services throw typed **domain errors** (`NotFoundError`, `ConflictError`,
`ForbiddenError`, `ValidationError`) from `common/errors/`. The global
`AllExceptionsFilter` maps them (and Prisma/HTTP errors) to the standard
`{ error: { code, message, details? } }` envelope with the right status. **No
stack traces or internals** reach the client. 4xx are expected; 5xx are logged as
incidents with the correlation id.

### Structured logging

Inject `PinoLogger` (`@InjectPinoLogger`). Log meaningful events (created,
updated, soft-deleted, authz denied) as **structured** fields with a message —
never string-concatenated. Every log carries the request **correlation id**
automatically; sensitive fields are redacted at the logger. Never log secrets,
tokens, or PII. See [`OBSERVABILITY.md`](OBSERVABILITY.md).

### Configuration usage

Never read `process.env` in a feature. Read typed, validated config via
`AppConfigService` (backed by the Zod-validated schema). Add new config keys to
the schema and `.env.example`. See [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

### Authentication & authorisation integration points

- **Authentication** is global and deny-by-default; the principal is resolved by
  the `AuthContextService` seam (wired to Better Auth when you add auth) and injected via
  `@CurrentUser()`. Mark genuinely public routes `@Public()`.
- **Authorisation** = `@RequirePermissions('‹resource›:‹action›')` (a coarse
  capability gate) **plus** an authoritative, organisation-scoped check in the
  service (`principal.can(permission, resourceOrganizationId)`) after loading the
  resource — the defence against **IDOR**. Each feature defines its permission
  codes and role→permission map in `<feature>-permissions.ts`. See
  [`SECURITY_STANDARDS.md`](SECURITY_STANDARDS.md) and ADR-0012.

### Database interaction patterns

Model the entity in `prisma/schema.prisma` per [`DATABASE.md`](DATABASE.md):
snake_case columns (`@map`), UUID v7 PKs, `timestamptz` UTC, a scoping key
(`organization_id`), **soft delete** (`deleted_at`), **auditing**
(`created_at/updated_at/created_by/updated_by`), an optimistic-locking
`version`, and scoped indexes. Access is exclusively through the repository
(parameterised Prisma queries; never string-built SQL). Every schema change is a
committed migration.

### Observability & health hooks

Structured, correlated logs (above) and OpenTelemetry spans/metrics on critical
paths (ADR-0013). Liveness/readiness are provided globally by the `health`
module (`@nestjs/terminus`); if a feature introduces a new critical dependency,
add it to the readiness check.

### Standard → where (map)

Paths are relative to `apps/api/src/modules/clients/` unless noted — the
canonical exemplar. The richer patterns name their own module.

| Standard                                                      | Where                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Module structure / DI                                         | `clients.module.ts`                                               |
| Controller (thin, OpenAPI, status codes)                      | `clients.controller.ts`                                           |
| Service (use cases, authz, errors)                            | `clients.service.ts`                                              |
| Repository (data access, soft-delete filter, optimistic lock) | `client.repository.ts`                                            |
| Validation (DTOs)                                             | `dto/*.dto.ts`                                                    |
| Response/error envelope                                       | live infra (`src/common/interceptors`, `src/common/filters`)      |
| Pagination / filtering / sorting                              | `clients.service.ts` + `src/common/dto/pagination-query.dto.ts`   |
| RBAC + resource scoping                                       | `src/common/auth/org-permissions.ts` + `principal.can()` + guards |
| Database standards                                            | `prisma/schema.prisma` (the `Client` model)                       |
| Logging / correlation                                         | `clients.service.ts` (PinoLogger)                                 |
| Unit tests                                                    | `clients.service.spec.ts`                                         |
| Integration / API e2e                                         | `apps/api/test/clients.e2e-spec.ts`                               |
| Soft-delete **cascade** + restore guards                      | `modules/notes` + `src/common/hierarchy/` (ADR-0046)              |
| Advisory locking                                              | `src/common/db/*-advisory-lock.ts` (ADR-0022/0028/0053)           |
| A distinct auth principal + guard                             | `modules/share/share-token.guard.ts` (ADR-0051)                   |

---

## Testing

Per [`TESTING.md`](TESTING.md):

- **Unit** (`*.service.spec.ts`): test the service with the **repository mocked**
  — cover happy paths and every failure mode (authz denied, not-found, conflict/
  optimistic-lock). Fast, no database.
- **Integration / API e2e** (`test/*.e2e-spec.ts`): boot the real Nest app
  (global pipe, filter, interceptor, guards) and drive endpoints with
  **Supertest** against **real Postgres**, asserting status codes and the
  `{ data, meta }` / `{ error }` envelopes. Override the auth seam with a test
  principal. Skip when `DATABASE_URL` is unset (runs in CI).
- **≥ 80% coverage on changed code**; every bug fix ships a regression test.

## OpenAPI documentation

Controllers and DTOs carry `@nestjs/swagger` decorators (`@ApiTags`,
`@ApiOperation`, `@ApiOkResponse`/`@ApiCreatedResponse`, `@ApiProperty`,
`@ApiCookieAuth`). The spec is served at `/api/docs` outside production and is
part of review. Response DTOs never expose internal/audit columns. Keep
[`API.md`](API.md) in step.

## Security best practices (checklist)

- [ ] Authenticated (or `@Public()` with justification), deny-by-default
- [ ] Permission check **and** resource-scope check (anti-IDOR)
- [ ] DTO validation; unknown fields rejected; limits enforced
- [ ] Parameterised Prisma only; no string SQL; no unsanitised HTML
- [ ] No secrets/PII in logs; audit fields on writes
- [ ] Safe error messages (no internals); rate limiting appropriate to sensitivity

See [`SECURITY_STANDARDS.md`](SECURITY_STANDARDS.md).

## Performance considerations

- Index every filtered/sorted column; **cursor-paginate** all lists with a capped
  limit; select only needed columns; no N+1 (deliberate `include`/`select`).
- Keep transactions short; do no network/queue I/O inside them.
- Offload slow/retriable work to jobs (ADR-0009); cache only measured hot reads
  with explicit TTL + invalidation (ADR-0010). Measure before optimising. See
  [`PERFORMANCE.md`](PERFORMANCE.md).

## Documentation expectations

Every feature updates: [`API.md`](API.md)/OpenAPI (contract), affected standards
docs, its module `README` if non-obvious, TSDoc on non-trivial methods, a
changeset for user-visible change, and an **ADR** for any architecturally
significant choice. Keep `CLAUDE.md` in step if project rules change.

---

## Frontend feature template

There is no runnable web app yet (roadmap M1), so this is the documented pattern;
the authoritative detail is in [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md),
[`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md), [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md),
and [`FRONTEND_QUALITY.md`](FRONTEND_QUALITY.md).

### Structure & integration points

```text
apps/web/src/features/<feature>/
├── api/          # Query/mutation hooks + a query-key factory (TanStack Query)
├── schemas/      # Zod schemas (shared with the API contract where possible)
├── components/   # Feature-scoped components (compose design-system primitives)
├── hooks/        # Feature-scoped hooks
└── index.ts      # The feature's public surface
```

- **Data** flows through TanStack Query hooks that call the typed API client
  (cookies for auth); components never `fetch`. Server data lives in the Query
  cache; URL state (filters/pagination) lives in the router.
- **Forms** use React Hook Form + Zod via the accessible `Form` primitive.
- **State coverage:** every view designs loading (skeleton), empty, error (retry),
  and success states.

### Accessibility considerations

WCAG 2.2 AA is a merge requirement: semantic HTML, full keyboard operability,
visible focus, labelled controls with linked error messages, ≥ 4.5:1 contrast in
light **and** dark, no meaning by colour alone, and `prefers-reduced-motion`
honoured. The **accessibility-reviewer** agent audits UI. See
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

### Frontend performance

Route-based code splitting; lazy-load heavy UI; skeletons to avoid layout shift;
prefetch on intent; justify every dependency against the bundle budget. See
[`FRONTEND_QUALITY.md`](FRONTEND_QUALITY.md).

---

## Creating a new feature

1. **Run the process first** ([`PROCESS.md`](PROCESS.md)): spec + plan, approved.
2. Read the nearest exemplar end to end — usually
   [`apps/api/src/modules/clients/`](../apps/api/src/modules/clients/) — and
   create `apps/api/src/modules/<feature>/` with the same file set:
   `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`,
   `<entity>.repository.ts`, `dto/`, `<feature>.service.spec.ts`.
3. Add your model to `apps/api/prisma/schema.prisma` and write the migration
   (`pnpm --filter @repo/api prisma:migrate`). Anything Prisma cannot express —
   partial indexes, CHECK constraints — goes in the migration as raw SQL, with a
   comment in the model and **no** `@@index` declaration (see the `Activity`
   model for why: a declared full index that the database does not have breaks
   the CI schema-drift check).
4. Add the feature's permission codes to
   [`src/common/auth/org-permissions.ts`](../apps/api/src/common/auth/org-permissions.ts)
   and map them to roles there. (A module owns its own permissions file only
   when it needs a non-org permission — `modules/interchange` is the one case.)
5. Register the module in `AppModule`.
6. Write the tests as you go — unit alongside the service, e2e in
   `apps/api/test/<feature>.e2e-spec.ts` — and get them **green**.
7. Update `API.md`/OpenAPI and any affected docs; add a changeset.
8. Review with the relevant agents (api, security, backend-performance,
   test-engineer).

## What to customise vs. what must stay consistent

**Customise (per feature):** the entity, fields, model + migration, DTOs and
validation rules, permission codes and role map, business rules in the service,
the specific queries in the repository, and the endpoints.

**Keep consistent (never diverge without an ADR):**

- The **layering** controller → service → repository and the dependency rule.
- **Deny-by-default** auth + **permission + resource-scope** checks.
- The standard **`{ data, meta }` / `{ error }` envelopes** and status codes.
- **Validated DTOs**; safe response DTOs (no internal columns).
- **Soft delete, auditing, optimistic locking**, UUID v7, `timestamptz`,
  scoped indexes.
- **Structured, correlated logging**; typed config; no `process.env`.
- **Tests** (unit + API e2e) and the coverage bar.

## Common mistakes to avoid

- Putting business logic in the controller, or Prisma queries in the service.
- Forgetting the **resource-scope** check (permission-only ⇒ IDOR).
- Returning the raw entity (leaking `deletedAt`/`createdBy`) instead of a
  response DTO.
- Skipping the soft-delete filter, or bypassing the repository from the service.
- Using floats for money; using `ParseUUIDPipe` (rejects UUID v7) instead of the
  provided validator.
- Swallowing errors, or leaking internal messages/stack traces to clients.
- Reading `process.env` directly; logging secrets/PII.
- Adding an endpoint without OpenAPI annotations, tests, or a doc update.
- Copy-pasting one-off styling on the frontend instead of design-system tokens.

## Keeping this document honest

There is no script that can verify this. The exemplars are real modules under
real tests, so they cannot stop compiling — but they _can_ stop being
representative, quietly, if the standard moves and this document does not follow.
Two habits keep that from happening:

- **When you change a cross-cutting standard** (an envelope, a guard, the auth
  model, a DB convention), update this document in the same pull request. The ADR
  that changes the standard is not a substitute — a reader looking for "how do I
  build a feature" comes here.
- **Check the exemplars during the periodic reconcile**
  ([`TECH_DEBT.md`](TECH_DEBT.md)): do the three named modules still exist, and
  is each still the best example of what it is named for?
