# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-09, at the end of the 1.1.0 build (M0 to M3 and the M4-T1 documentation sweep), on branch
`claude/backwards-compat-review-7oczdw`, not yet pushed or merged. Goal: **1.1.0, the fresh start**
([ADR-0215](adr/0215-a-fresh-start-is-a-new-database-and-the-image-refuses-the-old-one.md), Accepted 2026-11-09;
spec and plan in [`docs/specs/fresh-start-1-1/`](specs/fresh-start-1-1/feature-spec.md)). The owner's **hard rule**
still stands: nothing that needs the owner to run or check anything on their server or devices (a decision question
is fine; a test is not). **P6 M5 and M6 still wait for a real P6 export**; do not offer them.

## What shipped on the branch

- **M0:** spec, plan, schema design, ADR-0215 (drafted) and the start-fresh guide (a draft).
- **M1:** the 48 web feature flags retired in four batches (A to D), the flag-off suites removed, the pen taken
  through the UI in the Playwright suites (#121 closed).
- **M2:** one 1.1 baseline migration replacing the migration history (exact equivalent, `tidy.sql` empty), and the
  entrypoint's `schedulepoint-backup preflight`, which refuses a pre-1.1 database and logs `boot.database_refused`.
- **M3:** the boot re-derivation services, the placement-migration report and the pre-1.1 record tables removed;
  baseline snapshot levels narrowed; a plan's recalculation stamp made one fact. Inventory:
  [`m3-inventory.md`](specs/fresh-start-1-1/m3-inventory.md).
- **M4-T1 (this commit):** operating docs describe 1.1.0 (`CLAUDE.md`, `RELEASE_1_0.md` with a "1.1.0 — the fresh
  start" section, `DEPLOYMENT.md`, `OBSERVABILITY.md`, `ROADMAP.md`), ADR-0215 Accepted with amendment notes on
  the ADRs it amends, TECH_DEBT #571 closed, stale `VITE_*` flag comments in `ci.yml` reworded.

## What remains

1. **M4-T2, the dress rehearsal** (`docs/specs/fresh-start-1-1/m4-rehearsal.md` to be written). It needs a Docker
   host; the cloud container has none. Run 1.0.0, seed an organisation, `backup now` and `check`; start a 1.1.0
   candidate image and confirm the refusal leaves the database unchanged; follow the guide verbatim; follow "if you
   need to go back". Fix the guide where reality differs, then remove its DRAFT banner. devops-reviewer is blocking.
2. **M4-T3, the changeset** (one PR, last): both apps, a **minor** bump to 1.1.0 (the one-time exception to
   ADR-0190, recorded in ADR-0215 D7), breaking-change footer in the commit.
3. **The owner's steps**, from [`guides/start-fresh-on-1-1.md`](guides/start-fresh-on-1-1.md): Part 1 before the
   release is merged, Parts 2 and 3 on the day, Part 5 thirty days later. Merging the Version Packages PR is the
   production deploy (ADR-0047); do not merge it before the owner has done Part 1.

## Open items

- **#575** (legacy painter and gesture modes) and **#576** (a project delete racing an import) are open by design.
- **Perf-probe readings** taken before `e82bf48a` are not like for like with later ones: that commit retired the
  flags that changed what the probe scenes draw. Do not compare across it.
- **CI's "Refuse a pre-1.1 database" step has never run in real Docker.** The first CI run on this branch is its
  first test; read that step's log, not just its colour.

## Environment notes

- `pnpm --filter @repo/web lint` needs `NODE_OPTIONS=--max-old-space-size=8192`; so does `pnpm prepush`.
- Playwright in the cloud container: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.
- The Prisma client must be regenerated (`pnpm --filter @repo/api exec prisma generate`) after any schema change,
  or after switching to this branch, before typecheck or tests mean anything.
- Do not run Playwright or `scripts/e2e-local.sh` from more than one agent at once: one database, fixed ports.
