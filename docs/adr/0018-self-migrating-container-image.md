# ADR-0018: Self-migrating container image

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Engineering

## Context

The API owns the database schema via Prisma migrations. Something must run
`prisma migrate deploy` against the target database before (or as) a new API
version starts serving traffic. With no deployment platform chosen yet (§17),
there is no external migration orchestrator — an operator running the published
image with `docker compose` had no obvious, safe place to apply migrations, and
the first real deployment failed because the schema was never created.

Forces:

- The image must be runnable by a plain `docker compose up` without a separate,
  easily-forgotten manual migration step.
- Migrations must run **once per rollout, before the app accepts traffic**, and
  must not race across replicas.
- The image already ships the Prisma CLI, schema, and migrations.

## Decision

We will make the API image **self-migrating**: its entrypoint
(`apps/api/docker-entrypoint.sh`) runs `prisma migrate deploy` and then
`exec node dist/main.js`. The runtime image therefore carries the Prisma schema
and `migrations/` directory and keeps the Prisma CLI as a **production**
dependency. The health check start period is widened to cover the
migrate-then-boot sequence on first run.

## Alternatives considered

- **A separate one-shot migration container/job** run before the API — the
  cleaner pattern at scale (and what a Kubernetes `Job` or a platform release
  hook would do), but it needs an orchestrator we have not chosen and makes the
  bare `docker compose` path fragile. Deferred, not precluded.
- **Migrate on app boot from within Nest** — couples app startup to CLI
  behaviour, complicates advisory-locking, and muddies the app's runtime deps.
- **Leave migrations fully external** — what we had; it made the image unusable
  without out-of-band steps and caused the first deploy failure.

## Consequences

- `docker compose -f docker-compose.release.yml up` (and the local build
  compose) now produces a working stack with no manual migration step.
- `prisma migrate deploy` is idempotent and takes a Postgres advisory lock, so
  concurrent replicas coordinate rather than double-apply — acceptable for the
  current single-node target.
- The runtime image is slightly larger (Prisma CLI + engine) and boots slightly
  slower on first run (one migration pass). Accepted for operability.
- When a real deployment platform is chosen, migrations may move to a dedicated
  release step; this ADR is then superseded rather than deleted. The
  expand/contract migration discipline (§11, `docs/DATABASE.md`) still applies.

## References

- `apps/api/Dockerfile`, `apps/api/docker-entrypoint.sh`, `docs/DEPLOYMENT.md`.
- ADR-0017 (release & publishing), ADR-0020 (CI image smoke-boot).
