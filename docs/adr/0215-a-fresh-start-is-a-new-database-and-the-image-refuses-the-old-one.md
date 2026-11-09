# ADR-0215: A fresh start is a new database, and the image refuses the old one

- **Status:** Proposed — drafted 2026-11-08 in M0 of the 1.1.0 plan; Accepted at M4, once the dress rehearsal has run.
- **Date:** 2026-11-08
- **Deciders:** Product owner (spec, schema design and plan approved 2026-11-08; answers in
  [`docs/DECISIONS.md`](../DECISIONS.md), 2026-11-08) and Claude Code (feature-analyst, database-architect).
- **Spec:** [`docs/specs/fresh-start-1-1/feature-spec.md`](../specs/fresh-start-1-1/feature-spec.md) §4.10 ·
  **Schema design:** [`schema-design.md`](../specs/fresh-start-1-1/schema-design.md) ·
  **Plan:** [`implementation-plan.md`](../specs/fresh-start-1-1/implementation-plan.md)
- **Amends:** [ADR-0018](0018-self-migrating-container-image.md) (the entrypoint gains a first step),
  [ADR-0192](0192-a-backup-is-a-file-the-image-writes-and-a-restore-never-overwrites.md) (`pre-migrate` runs after
  the refusal; a 1.0 copy is checked and restored with the 1.0.0 image),
  [ADR-0194](0194-an-organisations-export-is-a-promised-format-streamed-on-the-request.md) (the export file and
  columns listed in D6 are removed),
  [ADR-0107](0107-a-migration-a-pristine-database-cannot-test.md) D2 (the migration-proof specs go with the
  migrations they proved),
  [ADR-0025](0025-baselines-snapshot-and-variance.md) (amendments 2–7: "NONE is permanent" is moot on a fresh
  database),
  [ADR-0212](0212-a-plan-keeps-the-instant-beside-the-date.md) D4 (the freshness marker read for an older run goes
  with the re-derivation services) and
  [ADR-0214](0214-a-frozen-float-carries-its-minutes.md) ("until the 1.0 wipe" becomes "until the 1.1.0 fresh
  start").
- **Records against:** [ADR-0190](0190-what-1-0-promises.md) (a one-time exception, D7) and
  [ADR-0088](0088-flag-classification.md) / [ADR-0084](0084-feature-flag-retirement.md) (D8).
- **Builds on:** ADR-0047, ADR-0057, ADR-0076, ADR-0105, ADR-0110, ADR-0138.

## Context

1.0.0 was released on 2026-11-08 as a private dress rehearsal, and its only user said every stored row is test
data and that "all plans will be wiped" (`docs/DECISIONS.md`, 2026-11-08). The code still carries three kinds of
weight that exist only for the past: 48 web feature flags, all Class B and compiled on in every published image
(`scripts/flag-retirement.json`); code that copes with rows an older version wrote (five boot re-derivation
services, baseline snapshot levels that default to "captured before this existed", a one-time placement-migration
report); and 84 migrations, with eleven API e2e specs that exist only to prove a migration transformed old rows.

The owner's server follows `latest` with Watchtower, so whatever is released is deployed unattended. A new image
that meets the old database must therefore do something safe by itself.

## Decision

**D1. One baseline migration.** The 84 migrations are replaced by one baseline, generated from the schema and
completed with the raw SQL Prisma cannot see (the `ENABLE ALWAYS` audit triggers, partial indexes, CHECK
constraints). Its name and the tidy folded into it are owned by `schema-design.md`. It stays editable until 1.1.0
is released and is frozen from then on. A database built from it equals one built from the chain except for the
listed tidy-ups, proved by catalogue comparison (schema design §7), once, as a milestone task.

**D2. The image refuses a pre-1.1 database before anything else.** The entrypoint becomes `preflight`,
`pre-migrate`, `prisma migrate deploy`. `preflight` reads `_prisma_migrations` and refuses, exit 1, a database
that has finished rows and none named the baseline (`pre_1_1_lineage`), one that has tables but no
`_prisma_migrations` (`unknown_database`), and one it cannot read (`cannot_read`, fail closed). It prints one plain
sentence, the guide's path and one `boot.database_refused` JSON line, and writes nothing. An empty database, or
one holding the baseline and later 1.1.x migrations, proceeds. It runs first because `pre-migrate` would otherwise
take a full copy on every restart of a refused container, and because `migrate deploy` failing could leave a failed
row that also blocks 1.0.0.

**D3. The owner's switch is a new volume, never an automatic wipe.** The guide
([`docs/guides/start-fresh-on-1-1.md`](../guides/start-fresh-on-1-1.md)) has the owner back up and check on 1.0.x,
copy the file out of the backups folder, rename the database volume in their own compose file, and start 1.1.0.
`docker-compose.release.yml` is not changed: doing so would put every operator who pulls it on an empty volume.
The old volume is kept 30 days. Rollback is the old volume, then the `1.0.0` tags, in that order.

**D4. Code that exists only for older rows is removed.** The rule: a branch goes only if its sole producer is a row
an older version wrote; a branch that also serves "never calculated", "no active baseline", "side not scheduled" or
"matched on code" stays. The inventory is feature spec §4.3, completed by M3. The engine
(`apps/api/src/modules/schedule/engine/`) is not edited. Kept: the CSP legacy report-body parser, soft delete, the
recycle bin, retention, backups, the edit lock, and XER/MSPDI import.

**D5. A 1.0 backup copy is checked and restored with the 1.0.0 image.** A 1.1.0 backup container's `check` and
`restore` say so, rather than "made by a newer version" (the wrong way round).

**D6. Published shapes are removed, once.** Under the owner's answer to Q1 (option E) and `schema-design.md` §12
P-c and Q2, these go in 1.1.0: baseline response `placementSnapshotLevel` and `swimlaneSnapshotLevel` (enums
narrowed); variance `basis` value `NETWORK`; revision and cross-plan compare `datesBasis` value `NETWORK`;
`placementNotAssessableReason` on both revision change reports (the published form of the `bothPlacementSnapshotted`
option this list first named, which is internal: it could only ever be `null`); `NOT_SNAPSHOTTED` as a
not-assessable reason; `PlanEarnedValue.costPhasingApproximatedCount` and `floatNotComparableCount` on variance,
revision compare and cross-plan compare (all four became constant `0`; the owner chose to remove them, Q-A); the route
`GET /api/v1/organizations/:orgSlug/plans/:planId/placement-migration`; the organisation export file
`records-placement-migrations`; the constant snapshot-level columns of the exported `baselines`; and the "empty
when calculated before 2.5" wording of `totalFloatMinutes` (spec §4.6 and the M3 inventory §6 together are the
complete list). `docs/API.md`, the OpenAPI
spec and `docs/ORGANISATION_EXPORT_FORMAT.md` (a new format version) change in the PR that removes each. No request
shape changes; `swimlaneSource: NONE` is a live choice and stays.

**D7. The exception to ADR-0190 is recorded, and it is not a precedent.** Three things are decided together.

1. **The removals in D6** break ADR-0190 D1/D2 by the letter (a removed field, route and export file is a major).
   Justified because nothing outside SchedulePoint calls the API (`docs/RELEASE_1_0.md`, "none does today"), one
   person uses it, every row is test data, and the database it was written against is replaced.
2. **The version is 1.1.0, not 2.0.0**, although rollback by tag-pinning does not cross it and every existing
   database is refused. ADR-0190 D1 excludes the database schema, and D3's "saved links stop resolving" is caused
   by the owner deleting the data, not by code.
3. **Removing the 48 `VITE_` lines from `.env.example` is not a break of promise 3.** Vite inlines them at build
   time and no build path passes them (`.env.example`), so they were never an operator setting.

From 1.1.0 on ADR-0190 holds in full: a release that cannot open the previous database, or that removes a
published shape, is a major. This paragraph is the only exception and is not to be cited for another.

**D8. The flag process stays.** All 48 remaining Class B flags are retired as one batch (OD-5), and
`scripts/flag-retirement.json` ends with `"flags": {}`. `flagDefaultOff`, `flagDefaultOn`, `check:flags` and the
classification of ADR-0088 are kept: a new flag is born default-off and enabled by switching to `flagDefaultOn`, so
both are the process's two states and not dead code. ADR-0084 and ADR-0088 are not amended.

## Alternatives considered

- **Keep every published shape (spec Option K).** No exception, no export change; a few fields that always read
  `FULL` and a route that always answers empty. Declined by the owner in favour of removing what can never be
  produced.
- **2.0.0.** Honest about the refusal; declined by the owner for a one-user installation (D7).
- **An automatic wipe on boot, or a wipe command.** Rejected by OD-3: an unattended deploy must never delete.
- **Let `prisma migrate deploy` fail against the old database.** Leaves a failed `_prisma_migrations` row that also
  blocks 1.0.0, and its transaction behaviour was not established.
- **Refuse every database newer than the image.** Forbids rollback by tag-pinning inside 1.1.x (ADR-0190 D4).
- **Change `docker-compose.release.yml` to a new volume name.** Would wipe every other operator's view of their data.
- **Leave the migrations and flags alone.** Carries the weight indefinitely; the owner chose the one reviewed release.

## Consequences

- The 0.106.0 / 0.202.0 rollback in `docs/RELEASE_1_0.md` stops applying across 1.1.0; M4 rewrites it. Rolling back
  across the release is the old volume plus `1.0.0` tags, volume first (a 1.0.0 image on the new volume would try
  to apply 84 migrations to a 1.1 schema).
- A refused database costs the owner a 30 to 45 minute outage of their own timing, and no data.
- `check:counts` moves (migrations 84 to 1, suites, source files); the figures are corrected in the same PRs.
- No new `docs/guides` index exists, so the guide is linked from this ADR and the register line.
- No changeset until M4 T3, and no Version Packages PR is merged while the epic is open (release freeze).

## References

- [`docs/specs/fresh-start-1-1/`](../specs/fresh-start-1-1/feature-spec.md); [`docs/DECISIONS.md`](../DECISIONS.md),
  2026-11-08; ADR-0190 and `docs/RELEASE_1_0.md`.
