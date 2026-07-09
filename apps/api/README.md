# @repo/api

The Blank App REST API: **NestJS 11 + TypeScript**, **Prisma** ORM over **PostgreSQL**,
authentication via **Better Auth**, and an **OpenAPI** contract generated with
`@nestjs/swagger`.

> **Status:** the architecture and cross-cutting infrastructure are implemented
> and the API boots (health/readiness, OpenAPI, Prisma, logging). **No
> business/domain features exist yet**, and the schema has **no models** — the
> first feature writes the first migration. Build features by copying the
> **non-shipping reference template** in
> [`examples/reference-feature/`](examples/reference-feature/) — see
> [`docs/REFERENCE_FEATURE.md`](../../docs/REFERENCE_FEATURE.md) and ADR-0014.
> Authentication is a seam that denies by default (401) until Better Auth is
> wired (when you add authentication).

## Structure

```text
src/
  main.ts             # Nest bootstrap (Helmet, versioning, Swagger, CORS, logging)
  app.module.ts       # Root module: global logging, rate limit, validation, guards
  common/             # Cross-cutting: auth, guards, filters, interceptors, decorators, errors
  config/             # Typed, Zod-validated configuration
  prisma/             # PrismaService + module
  health/             # Liveness/readiness probes (@nestjs/terminus)
  modules/            # Feature modules (empty until the first real feature)
prisma/
  schema.prisma       # Datasource + generator (no models yet)
  migrations/         # SQL migrations (none yet — first feature adds the first)
test/                 # Supertest end-to-end specs (*.e2e-spec.ts)
examples/
  reference-feature/  # Non-shipping TEMPLATE to copy (not compiled or shipped)
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
