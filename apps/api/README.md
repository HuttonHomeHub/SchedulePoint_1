# @repo/api

The SchedulePoint REST API: **NestJS 11 + TypeScript**, **Prisma** ORM over **PostgreSQL**,
authentication via **Better Auth**, and an **OpenAPI** contract generated with
`@nestjs/swagger`.

> **Status:** built and shipping. 19 feature modules under `src/modules/`, 25
> Prisma models across 41 migrations, 28 Supertest e2e specs, and a CPM/GPM
> scheduling engine whose conformance matrix is closed (ADR-0034).
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
  modules/            # 19 feature modules — see docs/REFERENCE_FEATURE.md for the exemplars
prisma/
  schema.prisma       # Datasource, generator, 25 models
  migrations/         # 41 SQL migrations
test/                 # 28 Supertest end-to-end specs (*.e2e-spec.ts)
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
