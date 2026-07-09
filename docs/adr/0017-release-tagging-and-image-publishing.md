# ADR-0017: Release tagging & image publishing via GitHub Actions

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Engineering

## Context

The delivery foundation (§11, ADR-0002) uses Changesets for versioning and a
`docker-publish` workflow to push images to GHCR. The original design assumed
the standard Changesets release step — `changeset publish` — would create the
`vX.Y.Z` git tag, and that the tag push would in turn trigger `docker-publish`
(which listened on `push: tags`).

Both assumptions were false in this repository:

1. **`changeset publish` no-ops on private packages.** Every workspace package
   is `"private": true` (we ship containers, not npm packages). `changeset
publish` only tags when it publishes something to a registry, so it published
   nothing and **never created a tag** — the repo could not cut a release at all.
2. **A tag pushed with `GITHUB_TOKEN` cannot trigger another workflow.** Even
   once tags were created in CI, GitHub deliberately suppresses workflow events
   from `GITHUB_TOKEN`-authored pushes (to prevent recursion), so a
   `push: tags`-triggered `docker-publish` would never fire.

The net effect: the pipeline looked complete but had never produced a release or
an image. This surfaced only when we first tried to publish a runnable image.

## Decision

We will drive tagging and publishing explicitly from the `release` workflow
rather than relying on `changeset publish` or tag-push triggers:

- The `release` job runs `changesets/action` to maintain the "Version Packages"
  PR. When that PR merges (no pending changesets, versions already bumped), a
  "Determine release" step reads the version and, if `vX.Y.Z` does not yet
  exist, pushes an **annotated tag** and creates a **GitHub Release**
  (`--generate-notes`).
- Publishing is invoked **directly** as a reusable workflow
  (`docker-publish.yml` via `workflow_call` with the version as input) from a
  `publish` job gated on the release job, instead of depending on the tag push
  to trigger it.

## Alternatives considered

- **A Personal Access Token / GitHub App token for the tag push** so the tag
  event triggers `docker-publish` — works, but adds a long-lived secret to
  manage and rotate purely to regain an event we can trigger directly. Rejected
  as unnecessary attack surface.
- **`changeset publish` to a private npm registry** so it tags — pulls in a
  registry we don't otherwise need and doesn't match our container-only
  distribution. Rejected.
- **Manual tagging by maintainers** — unreliable and defeats the automation goal.

## Consequences

- The pipeline now actually cuts releases: merging the version PR tags `vX.Y.Z`,
  publishes a GitHub Release, and pushes `api`/`web` images to GHCR (`0.2.1`
  was the first release cut this way).
- Publishing no longer depends on token-triggered events, removing a whole class
  of "the tag exists but nothing built" failures.
- The `release` workflow now needs `contents: write` (tags/releases) — a
  deliberate, scoped grant.
- Follow-up: because this logic lives in workflow YAML, it is only exercised on
  `main`; ADR-0020 adds a CI job that builds and boots the images so image
  regressions are caught pre-merge.

## References

- CLAUDE.md §11 (release & deployment); `docs/DEPLOYMENT.md`.
- `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml`.
- ADR-0002 (monorepo tooling), ADR-0018 (self-migrating image).
