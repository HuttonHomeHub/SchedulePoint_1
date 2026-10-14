# ADR-0194: An organisation's export is a promised format, streamed on the request

- **Status:** Accepted — 2026-10-14. The spec was approved by the product owner on 2026-10-14 with every default in
  its §6 (recycle-bin items, removed members and withdrawn invitations included with their deletion dates; the audit
  log as the Audit log screen shows it, without IP addresses or browser details; an "Export data" rail link for Org
  Admins, with the Members page as the fallback). Milestone 1 built the registry, the census, the permission and the
  format document; milestone 2 built the endpoint, its audit row and the measurement D3 rests on
  ([`m2-measurements.md`](../specs/organisation-export/m2-measurements.md)). The page (M3) is not built.
- **Spec:** [`docs/specs/organisation-export/feature-spec.md`](../specs/organisation-export/feature-spec.md) §4.4,
  §4.9 · **Plan:** [`implementation-plan.md`](../specs/organisation-export/implementation-plan.md) ·
  **Format:** [`docs/ORGANISATION_EXPORT_FORMAT.md`](../ORGANISATION_EXPORT_FORMAT.md)
- **Date:** 2026-10-14
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Implements:** [ADR-0085](0085-privacy-operations.md) D4 (the organisation export, Org Admin only) and D5 (it is
  audited as `privacy.exported`). **Amends:** `docs/PROJECT_BRIEF.md` §14 ("export generation is async / job-queue
  backed").
- **Builds on:** ADR-0012 (RBAC with resource scoping), ADR-0072 (what the audit log exposes), ADR-0076 (a computable
  claim is computed), ADR-0088 D1 (no flag), ADR-0105 (why this needed a spec), ADR-0110 (a gate is proven red),
  ADR-0172 (a soft-delete filter is stated at the query), ADR-0190 (what 1.0 promises) and ADR-0192 (the backup is the
  disaster-recovery copy; this is the owner's).

## Context

An organisation cannot take its data out of SchedulePoint in one piece. There are per-plan exports (P6 XER, MS Project
XML, and the diagram's CSV, PNG and PDF), each of which leaves things out by design, and a database backup
(ADR-0192) that holds every organisation on the server and is readable only with database tools. The brief promised
"an org admin can export all org data (JSON + CSV) at any time", and `docs/RELEASE_1_0.md` row 6 lists it as missing
and required for 1.0.

Three forces shape the answer. The file will be something the product **writes and 1.0 promises not to break**, so it
must be designed as a format with a version rather than as a dump. It leaves the tenant boundary in bulk, carrying
every member's name and email, cost and the audit log, so what it holds must be decided column by column. And the
brief's "async / job-queue backed" assumes BullMQ + Redis (ADR-0009) and an object store (ADR-0011), neither of which
is installed (`CLAUDE.md` §17).

## Decision

**D1 — Contents are decided per model and per column, and a census enforces it.** `export-columns.ts` lists the 28
models that are exported (each with its ordered, typed columns) and the 7 that are not (sessions, accounts,
verifications, plan locks, and the three installation-telemetry tables), each with a reason. Everything is included by
default; only these are withheld: credential digests (`tokenHash` of invitations and share links), the optimistic-lock
`version`, the restore `deleteBatchId`, a person's account state (only `id`, `name`, `email` and `createdAt` of a
member are exported), and the audit log's `ipAddress` and `userAgent`, which the Audit log screen never shows. Rows
are the organisation's in any soft-delete state. `export-census.structural.spec.ts` reads the Prisma schema and fails
when a model or a column has no decision, when a registry entry names something the schema no longer has, and when a
column's kind disagrees with the schema (including a calendar day typed as an instant). It has a negative control for
each failure, so it cannot pass vacuously. A future widening of who may export (for example to Planners) must revisit
the cost columns first.

**D2 — The format is versioned, documented, and independent of the schema.** One ZIP: `README.txt`, `json/<file>.json`,
`csv/<file>.csv` and a `manifest.json` written last. Instants are ISO 8601 UTC, calendar days `YYYY-MM-DD`, `BigInt`
and `Decimal` decimal strings, `null` is `null` or an empty cell. The CSV passes `text` columns only through the
formula guard (now shared as `csvCell` in `@repo/interchange`), so a negative number stays a number; the JSON is
authoritative and the CSV is a view. Adding a file or column is a minor format change, removing or retyping one is a
major change and, after 1.0, an API major. Readers ignore what they do not know. The database layout stays unpromised,
and there are no request options in v1, because each option multiplies the promised shapes. Every duration, lag and float column's name
carries its unit (the stored floats are minutes while the API serves working days, so the file says
`totalFloatMinutes`). New columns are appended at the end and a new enum value is a minor change. The three
migration-record files are informational and outside the promise, and the keys inside the two JSON columns are
informational too. No database name appears in the manifest. A test compares
`docs/ORGANISATION_EXPORT_FORMAT.md` with the registry.

**D3 — Generated synchronously and streamed; no job queue.** One read-only, repeatable-read snapshot, a per-organisation
advisory lock, bounded batches with back-pressure. **Reopen trigger:** an export at the brief's upper bound (100 plans
of 2,000 activities) measured at more than 5 minutes, or more than 256 MB added to the API's memory, or an ordinary
read's p95 above 1 s while it runs; or an organisation outgrowing the brief's data-scale target. Then tune (compression
level, batch size), then a worker thread, then ADR-0009 and ADR-0011.

**Measured at M2** ([`m2-measurements.md`](../specs/organisation-export/m2-measurements.md), ADR-0142): ten
plans of 2,000 activities with two baselines each (273 k rows, a 30 MB ZIP) export in **24 to 27 s**, add
**+273 to +292 MB** to a freshly started API (a plateau of about 540 MB resident, with a live heap flat
at 72 to 80 MB, so it does not grow with the size) and leave an ordinary read's p95 at **61 to 94 ms**.
The brief's typical organisation extrapolates to 15 to 19 s. **The upper bound extrapolates to 4.0
minutes at the fixture's 1.6 links per activity and 5.2 minutes at the brief's four, and to a 315 to
442 MB ZIP**, so the first two triggers are within 10 % of their thresholds rather than clear of them.
Nearly all of the time is the two reads of every table (the JSON and the CSV); compression is not the
cost, and the tuning tried (level, page size, text pieces, reading ahead) moved time or memory by at most
a fifth in one direction at the price of the other. The decision on those two figures is the owner's, with
the options in the measurement record's verdict; `docs/TECH_DEBT.md` #515 and #516 carry the triggers.

**D4 — Org Admin only, by POST, audited as `privacy.exported`, throttled, single-flight.** A new permission
`organization:export` is granted to Org Admin and nobody else, in its own bundle beside `audit:read`, pinned by a
structural spec asserting its holders are exactly `[ORG_ADMIN]`. It is not `interchange:export` (every member, one
plan) and not `audit:read` (ADR-0085 D4 and ADR-0072 decided separately). POST because the route writes an audit row
and a `SameSite=Lax` cookie travels on a cross-site GET. A success is recorded when the last byte is handed to the
proxy, which is not proof of receipt; a failure after the first byte is recorded with a reason.

**D5 — Nothing is stored.** No file is kept on the server, so there is no retention rule and no dependency on ADR-0011.

**D6 — Re-import is not promised.** The backup is the restore path. The format keeps every id and a version so an
importer is possible later; nothing promises one.

## Alternatives considered

- **A job queue and a stored file** — needs Redis, BullMQ and an object store on a non-technical owner's server, for a
  file measured in seconds at today's and the typical size, and adds a notification flow and a retention rule. Kept as
  the reopen path in D3.
- **Build to a temporary file, then send** — gives a `Content-Length`, but delays the first byte until the whole file
  exists and needs clean-up after a crash.
- **Stream without a snapshot** — an edit mid-export could leave a link whose activity is not in the file.
- **GET** — a Lax cookie travels on a cross-site GET, and the route has a side effect.
- **A filtered `pg_dump`** — couples the file to the database layout, which 1.0 does not promise, and exposes columns
  nobody decided to export.
- **Include-nothing-by-default** — safer against a new credential column, but a new ordinary column would then be
  silently missing from a "complete" copy. The census makes either default safe; include-by-default keeps the copy
  complete.

## Consequences

- The schema cannot gain a model or column without a decision about the export; a developer adding one sees the
  census fail and the sentence that says what to do.
- A format change is now a versioned, documented event. Removing or renaming an exported column after 1.0 is a major.
- The shared CSV guard lives in `@repo/interchange`, so the browser and the API cannot drift on it.
- Milestones 1 and 2 ship nothing a user can reach through the app: the route exists and is audited, and the page
  that calls it is milestone 3. `docs/PROJECT_BRIEF.md` §14, `docs/SECURITY_STANDARDS.md` and `docs/BACKLOG.md`
  are updated with the endpoint; `docs/RELEASE_1_0.md` row 6 and `CLAUDE.md` §17 change when the page lands.
- New debt: `docs/TECH_DEBT.md` #515 (a browser `Blob` for a ZIP of 300 to 450 MB) and #516 (the export reads every
  table twice, and the unmeasured multi-organisation case). The cost at the upper bound is extrapolated from a
  ten-plan measurement, not run.

## References

- ADR-0085 D4 and D5; ADR-0009; ADR-0011; ADR-0192; `docs/RELEASE_1_0.md` row 6;
  `docs/DECISIONS.md` (2026-10-13, pre-1.0 batch 2).
