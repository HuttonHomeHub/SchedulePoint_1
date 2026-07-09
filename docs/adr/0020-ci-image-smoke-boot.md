# ADR-0020: CI builds and smoke-boots the container images

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Engineering

## Context

CI (`ci.yml`) type-checks, lints, unit-tests, and runs source-level e2e against
the **source tree**. It never built the Docker images or ran them. Yet the
images are the only artifact anyone actually deploys.

As a result, a series of **runtime-only** regressions all passed CI green and
were caught only after a human pulled and ran the image in an environment:

- `@repo/types` shipping raw TypeScript (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
- The Prisma client not being regenerated inside the `pnpm deploy` output tree
  (`@prisma/client did not initialize`).
- `pino-pretty` missing from the production image (dev-only transport).

None of these are visible without building and starting the container. "CI is
green" meant "the source compiles and its tests pass", not "the thing we ship
runs".

## Decision

We will add an `image` job to `ci.yml` that, on every push and pull request,
**builds the `api` and `web` images from source and boots the full stack**
(Postgres + API + web) with `docker compose`, then waits for every container to
report healthy (`docker compose up --build --wait`) and curls the API health
endpoint and the web root as an explicit smoke check.

The stack boots under a development-profile override
(`docker-compose.ci.yml` sets `NODE_ENV=development`) so the API's production
startup guards (strong secret, trusted proxies, non-local CORS) do not refuse
to start during a health-only smoke test. Behaviour is already covered by the
`quality` and `e2e` jobs; this job's sole purpose is to prove the shipped
artifact builds and boots.

## Alternatives considered

- **Publish images and run a post-merge smoke test** — catches the same faults
  but only _after_ merge to `main`, so `main` still goes red and a bad image can
  be tagged. Pre-merge is the point.
- **Full production-profile boot in CI** (real secret, TLS, proxy) — closer to
  production but needs secrets and infrastructure in CI for little extra signal
  over "does it boot and serve health"; deferred.
- **Structure/lint the Dockerfiles only (hadolint)** — cheap and worth adding
  later, but it cannot catch runtime resolution/initialisation failures. Not a
  substitute.

## Consequences

- The three runtime regressions above (and their class) now fail CI **before**
  merge; `main` staying green means the image staying runnable.
- CI wall-clock grows by one image build + boot (kept parallel to the other
  jobs; no layer cache yet — a follow-up can add GHA build cache).
- The smoke test asserts boot + health, not full behaviour; deep behaviour stays
  with `quality`/`e2e`. This job should be a **required status check** on `main`
  alongside the others (see `CONTRIBUTING.md` → branch protection).

## References

- `.github/workflows/ci.yml` (`image` job), `docker-compose.yml`,
  `docker-compose.ci.yml`.
- ADR-0017 (release & publishing), ADR-0018 (self-migrating image),
  ADR-0019 (shared-package build contract).
