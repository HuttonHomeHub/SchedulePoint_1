# Deployment & Release

> **Status:** the release pipeline (versioning + image publishing) is defined;
> the concrete hosting platform is an open decision (see
> [TECH_DEBT.md](TECH_DEBT.md)). This document describes the process the
> foundation supports.

## Release flow (overview)

```mermaid
flowchart TD
  A[Merge PR with changeset to main] --> B[Release workflow runs]
  B --> C{Pending changesets?}
  C -- yes --> D[Open/update 'Version Packages' PR]
  D --> E[Maintainer merges version PR]
  E --> F[Versions bumped + CHANGELOG updated + tag vX.Y.Z]
  F --> G[docker-publish workflow on tag]
  G --> H[Images pushed to ghcr.io with SemVer + sha tags]
  H --> I[Promote images through environments]
  C -- no --> J[No release]
```

## Versioning

- **Semantic Versioning**, driven by **Changesets**. Contributors add a
  changeset (`pnpm changeset`) for user-visible changes.
- The [`release`](../.github/workflows/release.yml) workflow maintains a
  "Version Packages" PR. Merging it bumps versions, writes `CHANGELOG.md`
  entries, and creates a `vX.Y.Z` tag.

## Container images

- Built by [`docker-publish.yml`](../.github/workflows/docker-publish.yml) on
  version tags (and manually via `workflow_dispatch`).
- Published to **GitHub Container Registry**:
  - `ghcr.io/HuttonHomeHub/blank-app/api`
  - `ghcr.io/HuttonHomeHub/blank-app/web`
- Tags: full SemVer, `major.minor`, and commit `sha`. Images include an **SBOM**
  and **build provenance**.
- Images are **immutable**: the same artifact is promoted across environments;
  we never rebuild per environment.

## Environments (intended)

| Environment | Purpose                     | Source                            |
| ----------- | --------------------------- | --------------------------------- |
| Local       | Development                 | `docker compose`                  |
| Staging     | Pre-production verification | image tag from `main`/pre-release |
| Production  | Live                        | promoted SemVer-tagged image      |

Configuration and secrets are supplied per-environment via the platform's
secret manager — never baked into images or committed. See
[`.env.example`](../.env.example) for the required variables.

## Database migrations

- Applied with `prisma migrate deploy` as part of the release/deploy step,
  before the new API version serves traffic.
- Migrations are backward-compatible where feasible (expand/contract) so a
  rollout can proceed without downtime and a rollback stays safe.

## Runtime health & rollout

- The API exposes `/health` (liveness/readiness) for the orchestrator.
- Roll out gradually where the platform supports it; watch health and error
  rates. **Rollback = redeploy the previous image tag** (plus any compensating
  migration).

## Pre-release checklist

- [ ] CI green on `main` (lint, typecheck, unit, e2e)
- [ ] CodeQL clean; no unresolved high-severity alerts
- [ ] Changesets present for user-visible changes
- [ ] `CHANGELOG.md` reflects the release
- [ ] Migrations reviewed and reversible/safe
- [ ] Relevant docs updated
