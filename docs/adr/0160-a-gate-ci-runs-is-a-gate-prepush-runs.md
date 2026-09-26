# ADR-0160 — A gate CI runs is a gate prepush runs

- **Status:** Accepted
- **Date:** 2026-09-26
- **Supersedes:** nothing
- **Amends:** ADR-0136 (D1's placement of the bundle budget outside the root roster, and the
  Consequences paragraph that follows from it); `docs/specs/delivery-gates/` §4.3 D6
- **Spec:** [`docs/specs/prepush-bundle-gate/`](../specs/prepush-bundle-gate/)

## Context

ADR-0136 shipped the web bundle budget as a **workspace** script, `apps/web`'s
`check:bundle-size`, called by CI after the build and deliberately left out of the root `check:*`
set that `pnpm prepush` derives its roster from. Its reason was that the gate needs a production
build, and "making a five-second `pnpm prepush` wait thirty seconds for one is how a gate gets
bypassed". The same sentence was written in four places: the delivery-gates spec, ADR-0136, the
gate's docblock and the CI comment.

On 2026-09-26 PR #701 passed `pnpm prepush` and then failed CI on the bundle budget, at 439.21 kB
against 437 kB. The round trip is what the pre-push gate exists to save (`docs/TESTING.md`,
"Before you push"), and it was not saved because the one blocking CI gate the local command did not
run was the one that fired.

Re-reading the premise found it stale on one side and unmeasured on the other (spec §0, E8):

- **The denominator was never five seconds.** The command CLAUDE.md §19.8 tells people to run is
  the full `pnpm prepush`, measured at about six minutes (`docs/TESTING.md`; `pnpm test` alone is
  345 s). Even the `--checks` pass measured 10.4 s and later 12.3 s.
- **The numerator had never been measured.** No figure for "thirty seconds" appears in the
  delivery-gates spec.

A second defect sat under the first. The gate's docblock said a turbo cache hit could leave no
report and fail the check, and that this "cannot happen today" because CI configures no turbo
cache. That was true of CI's remote cache and false of turbo's **local** cache, which is on by
default. Measured 2026-09-26: with `apps/web/bundle-report.json` deleted, a warm
`turbo run build --filter=@repo/web` reported `6 cached, 6 total` and left no report, and the check
then failed asking for a build.

## Decision

**D1 — One root gate, `check:web-bundle`.** It is
`rimraf apps/web/bundle-report.json && turbo run build --filter=@repo/web && pnpm --filter
@repo/web check:bundle-size`. Prepush picks it up because its roster is derived from the root
`check:*` scripts. CI runs the same root command in place of the workspace call, after the
`Build (api + web)` step, so its build is a cache hit and `quality` (the job that bounds whole-CI
wall clock, ADR-0138) does not grow.

**D2 — A distinct name, not a root `check:bundle-size`.** `check:ci-roster` drops from its root set
any gate name that a `--filter` step also uses. It matches by name, not by invocation. A root
`check:bundle-size` would therefore vanish from the roster whenever a CI step also ran the workspace
script. The distinct name avoids that, and says what the root gate adds: it builds; the workspace
gate only checks.

**D3 — The report is a turbo build output, and it is deleted before the build.** Declaring
`bundle-report.json` in `turbo.json`'s `build.outputs` makes a cache hit restore the report for
exactly the inputs that produced it. Deleting it first means a build that fails, or writes no
report, can never be judged against an old one.

**Measured before building, against ceilings committed in the approved spec (FC-1, FC-2):** the
gate costs **16.8 s cold** (21.2, 16.6, 16.8 s; `TURBO_FORCE=true pnpm check:web-bundle`) against
60 s, and **1.5 s warm** (1.55, 1.64, 1.52 s, each `6 cached, 6 total`) against 10 s, on the
4-core Claude Code container. The warm runs started with the report deleted, so the cache hit is
what supplied it. Record: `docs/specs/prepush-bundle-gate/m1-measurement.md`.

**Verified red (ADR-0110 D5)** in `docs/specs/prepush-bundle-gate/m1-red-run.md`. An `import
'jspdf'` in `main.tsx` makes both `pnpm prepush` and `scripts/prepush.sh --checks` print `FAIL
check:web-bundle` and exit 1, with B1 (over budget) and B2 (jspdf in the entry graph). A type error
fails the gate rather than warning, because it is not in `ADVISORY_GATES` (ADR-0124). Removing the
CI step makes `check:ci-roster` refuse the root gate.

**D3's two protections were shown to be load-bearing, and the plan's test of them was not.** The
plan broke the build and removed the deletion to show the deletion mattered; both runs fail,
because `&&` stops at a failed build before the check reads anything. The case the protections
guard is a build that **succeeds without writing a report**, which a cache hit on an undeclared
output does. With both removed and a green report on disk, a bundle with jspdf in its entry graph
printed `check:bundle-size: OK` and **exited 0**. The deletion alone turns that into "build first";
the output declaration makes the answer the correct B1/B2 one.

## Alternatives considered

- **Build only when the diff touches the web app or its packages.** Rejected: a hand-written copy
  of what turbo's task hash already computes from the real graph. It would drift, and the drift
  would read as "skipped, therefore fine". On a warm cache D1 already costs what this would.
- **Keep it a separate opt-in command.** Rejected: that is the position PR #701 fell through.
- **A hard-coded step in `prepush.sh`.** Rejected: the script forbids a hand-kept list beside the
  derived one, and `check:ci-roster` could not see it.
- **Keep CI's workspace call and exempt the root gate in `ci-roster.json`.** Rejected: an exemption
  means "need not run in CI", which would be false of a gate CI runs under another name.

## Consequences

- `pnpm prepush` now builds the web app. Cold, that is about 17 s on the six-minute command; on an
  unchanged web app it is a cache hit.
- `scripts/prepush.sh --checks` is no longer build-free. The usage line says so.
- `check:ci-roster`'s workspace-resolution branch keeps its tests but has no live CI caller. It is
  kept because a future workspace gate would need it.
- **The general rule is not built.** Every gate CI runs should be run by prepush or exempt with a
  written reason, and nothing asserts that in the CI-to-prepush direction. `pnpm format:check` is
  the other known instance. On the product owner's decision (spec CQ-2) this ADR fixes the bundle
  gate only, and records the rule under `docs/TECH_DEBT.md` #299, because a reverse-direction
  roster assertion changes a shared gate and is an ADR-0105 trigger of its own.
- **The CPM engine is not imported and no migration runs.** No product code changes.
