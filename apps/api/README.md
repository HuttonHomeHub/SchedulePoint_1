# @repo/api

The SchedulePoint REST API: **NestJS 11 + TypeScript**, **Prisma** ORM over **PostgreSQL**,
authentication via **Better Auth**, and an **OpenAPI** contract generated with
`@nestjs/swagger`.

> **Status:** built and shipping — feature modules under `src/modules/`, a Prisma
> schema and its migrations, Supertest e2e specs, and a CPM/GPM scheduling engine
> whose conformance matrix is closed (ADR-0034). **The counts live in one place,
> and it is not here:** `CLAUDE.md`'s stage banner, re-derived and gated by
> `pnpm check:counts` (ADR-0076). This paragraph used to restate them and was
> wrong about **all four** — 20 modules against 22, 27 models against 29, 47
> migrations against 54, 32 e2e specs against 40. `apps/web/README.md` had the
> same defect and was fixed on 2026-08-09 by deleting its copies; this sibling was
> not looked at, which is exactly the failure `docs/RECONCILE.md` §1 warns about
> in its own words — _when you patch a gate, ask whether the same hole is in its
> siblings_.
> Authentication is wired (Better Auth, cookie sessions) and every route denies
> by default. Build features to the implementation standard in
> [`docs/REFERENCE_FEATURE.md`](../../docs/REFERENCE_FEATURE.md), starting from
> the nearest exemplar — `modules/clients` for the canonical shape (ADR-0057).

## Structure

```text
src/
  main.ts             # Nest bootstrap (Helmet, versioning, Swagger, CORS, logging)
  app-setup.ts        # Shared HTTP app configuration (reused by e2e specs)
  app.module.ts       # Root module: global logging, rate limit, validation, guards
  common/             # Cross-cutting: auth, guards, filters, interceptors, db locks, hierarchy
  config/             # Typed, Zod-validated configuration
  prisma/             # PrismaService + module
  health/             # Liveness/readiness probes (@nestjs/terminus)
  version/            # Build/version endpoint
  modules/            # Feature modules — see docs/REFERENCE_FEATURE.md for the exemplars
prisma/
  schema.prisma       # Datasource, generator, models
  migrations/         # SQL migrations
test/                 # Supertest end-to-end specs (*.e2e-spec.ts)
```

## Scripts

| Command               | Description                           |
| --------------------- | ------------------------------------- |
| `pnpm dev`            | Start Nest in watch mode              |
| `pnpm build`          | Compile to `dist/`                    |
| `pnpm test`           | Run unit tests (Vitest)               |
| `pnpm test:e2e`       | Run HTTP end-to-end tests (Supertest) |
| `pnpm prisma:migrate` | Create/apply a dev migration          |
| `pnpm prisma:deploy`  | Apply migrations (production/CI)      |
| `pnpm prisma:studio`  | Open Prisma Studio                    |

## Environment

Copy the root [`.env.example`](../../.env.example) to `.env` and provide a
`DATABASE_URL`. Never commit real secrets.
