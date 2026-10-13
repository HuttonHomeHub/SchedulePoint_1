# ADR-0190: What 1.0 promises

- **Status:** Accepted — 2026-10-13. The product owner approved the spec and plan on 2026-10-13 ("Approve; write 1.0
  down only") and answered the questions in spec §6: this decision writes 1.0 down and does **not** cut it, and three
  further lines (backup and restore, the organisation export, the recycle bin's permanent clear-out) are required
  before it.
- **Spec:** [`docs/specs/pre-1-0-batch-2/feature-spec.md`](../specs/pre-1-0-batch-2/feature-spec.md) §4.2 · **Plan:**
  [`implementation-plan.md`](../specs/pre-1-0-batch-2/implementation-plan.md) Milestone 1 · **Checklist:**
  [`docs/RELEASE_1_0.md`](../RELEASE_1_0.md)
- **Date:** 2026-10-13
- **Deciders:** James Ewbank (product owner) and Claude Code.

## Context

`CLAUDE.md` §10 says that while pre-1.0 "breaking changes bump the **minor**" and that "the move to 1.0 is a
deliberate, documented milestone". Nothing documented the milestone: no list of what must be true first, and no
statement of what 1.0 protects afterwards. `docs/API.md` "Versioning" says a new `/api/v1` major is introduced only
for breaking changes, and says nothing about the package versions (`api` 0.89.3, `web` 0.190.1) that Changesets
moves, so the two numbers could be read as one. ADR-0027 fixed how releases are tagged per package and does not
say what a major means.

## Decision

**D1 — the public contract.** From 1.0 the contract is: the REST API under `/api/v1` as described by its OpenAPI
document, including the guest share endpoints (`/api/v1/share/*`); the export file formats and the inert
SchedulePoint layout field (ADR-0156); and the operator's configuration surface (the environment variables in
`.env.example` and the Docker Compose files). **Not** the contract: `/api/v1/staff/*` (declared outside it in
`docs/API.md`, "The staff console"), the database schema, and the internal `@repo/*` packages.

**D2 — after 1.0.** A breaking change to D1 bumps the affected package's **major**. The URL version moves only for
a breaking REST change, and per `docs/API.md` that needs its own ADR and a migration note. Package major and URL
version are separate numbers that move for different reasons; a change's changeset and ADR say which it moves.

**D3 — `web`'s major.** The web app has no programmatic contract. Its major moves when a capability users rely on is
removed, or when saved links (plan URLs, share links) stop resolving.

**D4 — the cut.** One changeset, `'@repo/api': major` and `'@repo/web': major`, whose text is the 1.0 release note.
The owner decides when, and `docs/RELEASE_1_0.md` is the gate: every line is evidence-backed, owner-decided or "not
for 1.0". The owner's answers of 2026-10-13 fix three required lines (tested backup and restore, whole-organisation
export, the 90-day clear-out turned on and proven), each specified on its own after the batch that wrote this down,
and collaborative editing is not in 1.0 (`docs/DECISIONS.md`, 2026-10-12). The deprecated revision-comparison fields
(`docs/API.md`, "Deprecated fields") are removed at the cut by default, since a 1.0 cut is the last cheap moment to
do so. Internal packages are private and stay 0.x.

**Mechanics, checked rather than assumed.** A dry run on a throwaway branch on 2026-10-13 (`@changesets/cli`
3.0.3, command `pnpm changeset version` with a `major` changeset for both apps, then discarded) moved `@repo/api`
from 0.89.3 to **1.0.0** and `@repo/web` from 0.190.1 to **1.0.0**, changed only those two `package.json` files and
two `CHANGELOG.md` files, and left every internal package untouched; the changeset's text appeared under "Major
Changes". On the Release path the tags are `api-v1.0.0` and `web-v1.0.0` (`.github/workflows/release.yml:139-158`)
and the images carry `1.0.0`, `latest`, `sha-…` and `main` (`.github/workflows/docker-publish.yml:128-139`); the
`type=semver` patterns on lines 129-130 act only on the legacy `v*.*.*` tag trigger (`:4-10`), so no `:1` or `:1.0`
image tags appear. The host follows `latest` by default (`docker-compose.release.yml:74`), so 1.0 changes nothing
there.

## Alternatives considered

- **Cut 1.0 in the same batch.** Rejected by the owner: the checklist has open lines (5, 6, 7), so a cut now would
  promise a stability the product's own brief says it does not yet have.
- **Treat the URL version and the package major as one number.** Rejected: it would force `/api/v2` for any
  breaking change and make routine majors a client migration. Keeping them apart costs one sentence (D2).
- **Move the web app's major with the API's.** Rejected: the web app has no callers to break (D3).
- **Leave the checklist informal.** Rejected: "are we ready?" had no answer for months; a page with a kind and a
  proof per line gives it one.

## Consequences

- `CLAUDE.md` §10's pre-1.0 bullet points here instead of saying only "deliberate, documented milestone".
- `docs/API.md` "Versioning" separates package major from URL version.
- `docs/ROADMAP.md` gains a 1.0 entry linking the checklist. `docs/PROJECT_BRIEF.md` §16's hosting line is corrected
  (settled by `docs/TECH_DEBT.md` #5). The brief keeps the backup, export and retention promises, which are now
  required lines.
- Three specs follow: backup and restore, the organisation export, and turning the clear-out on.
- Two owner tasks, the alerts set-up and the device check sheet, are listed on the checklist as parked by the
  owner, with no position taken.
- The Changesets behaviour above is stated from a run, not from reading that package's source, so nothing is
  registered in `scripts/dependency-claims.json`.

## References

- ADR-0027 (per-package release tagging), ADR-0028 (single-editor lock), ADR-0034 (conformance), ADR-0105 (what a
  register row is not), ADR-0156 (layout field), `docs/DECISIONS.md` (2026-10-12 collaborative editing; 2026-10-13
  batch answers).
