# ADR-0027: Per-package release tagging & per-image versions

- **Status:** Accepted (supersedes the tagging scheme of ADR-0017)
- **Date:** 2026-07-11
- **Deciders:** Engineering

## Context

ADR-0017 drives tagging and image publishing from the `release` workflow: when
the "Version Packages" PR merges, a "Determine release" step computes a single
**aggregate** version — the **highest** of `apps/api` and `apps/web` — tags it as
`vX.Y.Z`, and invokes `docker-publish` to push both images under that one version.

That aggregate-max tag is **not monotonic for a single-package bump**. Because
Changesets bumps only the packages a changeset names, the two apps advance on
their own cadences. When one app catches up to the other's version, the aggregate
does not move and its tag already exists — so the release is silently skipped:

- Prior release put **api at 0.7.0** → tagged `v0.7.0`.
- A later web-only release bumped **web 0.6.0 → 0.7.0**. `max(0.7.0, 0.7.0)` is
  `0.7.0`, whose tag already existed → "Determine release" set `release=false`,
  and **no tag was cut and no web image was published**, even though a real,
  user-recorded release (`@repo/web@0.7.0`, with its CHANGELOG entry) had landed.

The failure is invisible in the default runtime here only because that particular
web change happened to be flagged off — but the provenance gap (a published
`v0.7.0` image predating the commits its CHANGELOG claims) and the "web-only
releases can silently no-op" hazard are real and would recur.

## Decision

Tag and version **each app independently**, rather than with one aggregate tag:

- Git tags become **`api-vX.Y.Z`** and **`web-vX.Y.Z`**. Each app's version
  sequence is monotonic _per package_ (Changesets guarantees a bump per release),
  so a tag collision cannot occur.
- "Determine release" reads `apps/api` and `apps/web` versions separately and, for
  each, marks it for release iff no changesets remain **and** its `{app}-v{version}`
  tag does not yet exist. The job releases if **either** app does.
- The `release` job tags + publishes a GitHub Release for each app that released.
- `docker-publish` takes a **per-app version** (`api_version` / `web_version`) and
  a **per-app publish flag** (`publish_api` / `publish_web`). Each image is tagged
  with **its own** package version, and **only the app(s) that released are built
  and pushed** — so an unreleased app's version tag never moves to drifted content.
  The `:latest`, `:main`, and `:sha` tags are unchanged, so coordinated deploys
  (docker-compose defaults `IMAGE_TAG` to `main`) are unaffected.

## Alternatives considered

- **Keep one aggregate tag but bump a repo-level version on any release.**
  Changesets bumps per-package and ignores the private root package, so a
  monotonic repo version would need bespoke tracking outside Changesets — more
  machinery than per-package tags, which Changesets already models natively.
- **Tag with a release counter / date (`release-N`).** Monotonic, but discards the
  semver-in-tag meaning that `docker/metadata-action` and operators rely on.
- **Accept the skip.** Rejected: silent no-op releases and image/CHANGELOG
  provenance drift are exactly the "the tag exists but nothing built" class of
  failure ADR-0017 set out to remove.

## Consequences

- Web-only and api-only releases each publish their own image at their own version;
  no release can be silently skipped by a version collision.
- Two tag namespaces (`api-v*`, `web-v*`) instead of one; the historical `v*` tags
  remain as-is (never rewritten). The per-app publish path runs through the Release
  workflow's `workflow_call` (which supplies the per-app version + flags);
  `docker-publish`'s bare `push: tags` trigger stays scoped to the legacy `v*` form
  (a prefixed `api-v*` push can't drive `docker/metadata-action`'s `type=semver`, and
  the matrix can't infer the target app from the ref) — a one-off manual publish uses
  `workflow_dispatch` instead.
- Per-app version tags mean the two images can legitimately differ in version.
  Coordinated deploys should pin `:main`/`:latest`/a git sha (as documented), or
  pin each app to its own version explicitly.
- ADR-0017's rationale (drive tagging/publishing from the workflow, not from
  `changeset publish` or token-triggered tag pushes) still holds; only its
  **single-aggregate-tag** mechanism is superseded here.

## References

- CLAUDE.md §11 (release & deployment); `docs/DEPLOYMENT.md`.
- `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml`.
- ADR-0017 (release tagging — tagging scheme superseded by this ADR), ADR-0020
  (CI builds & smoke-boots the images).
