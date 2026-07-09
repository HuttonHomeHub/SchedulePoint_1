# ADR-0002: Monorepo with Turborepo and pnpm

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Founding maintainers

## Context

Blank App comprises a web client and an API that share types and conventions and
must evolve together. We need a repository structure that keeps the front and
back ends in lock-step, enables code sharing, and gives fast, cacheable builds
and tests.

## Decision

We will use a **single monorepo** managed with **pnpm workspaces** and
orchestrated by **Turborepo**.

- `apps/*` holds deployable applications (`web`, `api`).
- `packages/*` holds shared libraries (`config`, `types`).
- pnpm provides fast, disk-efficient installs and a version **catalog** so
  shared dependencies stay aligned.
- Turborepo provides a task graph with local/remote caching for `build`, `lint`,
  `typecheck`, `test`, etc.

## Alternatives considered

- **Polyrepo (separate repos per app)** — clean isolation, but painful shared-
  type synchronisation, cross-cutting changes span multiple PRs, and duplicated
  tooling. Rejected for a small, tightly-coupled product.
- **npm/yarn workspaces without Turborepo** — workable, but we'd lose the task
  caching and orchestration Turborepo gives for little extra cost.
- **Nx** — powerful, but heavier and more opinionated than we need today.

## Consequences

- **Positive:** atomic cross-cutting changes, shared `@repo/*` packages, one set
  of tooling/CI, fast incremental builds via caching.
- **Negative / risks:** contributors must understand workspace filtering
  (`--filter`); Docker builds run from the repo root to resolve workspace
  packages (handled in the Dockerfiles).
- Requires the pnpm version to be pinned (`packageManager` + corepack).

## References

- [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), [`turbo.json`](../../turbo.json),
  [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml)
