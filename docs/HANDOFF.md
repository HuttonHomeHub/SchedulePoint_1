# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-06, after the batch approved on 2026-10-05: the register completeness gate
(#453), the staff-console server readings (#433 and the ADR-0174 history count), and the Gantt
touch-and-stylus pass up to M1.

## Where things stand

- `main` holds everything below. Latest releases: **web 0.173.0, api 0.88.0** (check the tags).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- **The previous hand-off said `main` ended with #835; it ended with #836.** Corrected here.

## What this batch shipped

| PR   | What                                                                                                                                                                                                                                                   | Release                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| #837 | **#453**: `check:debt-status` A11. Every number 1..max is a live row or a ledger line. The 17 lost numbers were **recovered** from git (none exempted); its first test file.                                                                           | none                     |
| #838 | Gantt touch **M0**: predictions, the coarse-target harness in `measure-gantt`, `/pointer-check.html`, the device checklist. Spec `docs/specs/gantt-coarse-pointer/`.                                                                                   | web 0.171.0              |
| #839 | Staff readings **M1**: three count-only history diagnostics in **Run diagnostics** (28-day entries, link/resource share, rows > 512 B). Re-arm trigger H-1 `examined` ≥ 250,000. Spec `docs/specs/staff-server-readings/`.                             | api 0.88.0 / web 0.171.0 |
| #841 | Staff readings **M2**: **Measure plan loading** in the Performance panel (reload / revisit / no-store; cache vs revalidated vs downloaded). Filed **#457** (nginx `add_header` drops headers) and **#458** (submit-guard scans submit buttons only).   | web 0.172.0              |
| #843 | Gantt touch **M1** + **ADR-0177** (Proposed): tap a bar, then drag it by finger or stylus; hold or right-click a row for its actions; Shift+F10 / Menu key by a keydown flag. Defaults applied while device answers are pending are in `m1-record.md`. | web 0.173.0              |

## Waiting on the product owner

- **The Surface test sheet** (`docs/specs/gantt-coarse-pointer/device-checklist.md`, sent 2026-10-06),
  plus the extra tick-boxes in `m1-record.md` (Menu key opens exactly one menu; stylus behaviour).
  His answers decide **Gantt M2** (bigger edge zones, the summary chevron, sort headers), whether the
  stylus stays gated like touch, and whether a `useLongPress` fallback is needed. **M2-T1 is already
  re-scoped**: the `⋯` trigger overlaps the start edge of bars that begin at the chart's left edge.
- **The plan-loading reading** (#433): open a plan, then staff panel → Performance → **Measure plan
  loading** → Copy. Record it in #433 and close or re-scope it.
- **The history count on or after 1 November** (ADR-0174 / #443): staff panel → **Run
  diagnostics** → Copy. Record it in #443 and the activity-history plan's M3-T2.
- **Gantt hands-on readings** are still owed (unchanged).

## Open rows that need a decision or a trigger

- **#457** (security headers on `/assets/`, `/theme-boot.js`, `/favicon.svg`): Low, but security
  review advised doing it at the next nginx change rather than waiting long; one shared
  include plus a `check:nginx` assertion.
- **#458** (submit-guard gate scope), **#456** (no statement timeout on the diagnostics press),
  **#454**, **#449**, **#450**, **#440–#446**, **#433**, **#432**, **#429**, **#419**, **#405**:
  unchanged or as filed.
- **#435** (the e2e flake row): its green-run count was not advanced this session; the runs on
  #837–#843 are candidates for the count.
- **ADR-0177** stays Proposed until D4 (the target-size exception lists) is written at Gantt M2.
- A prepared, **not adopted** pre-aggregate rewrite of the history diagnostics sits on
  `wip/history-numerator-preaggregate` (`64ff45d4`); it conflicts with gate S-4 and is the first
  remedy to measure when the 250,000 trigger fires (`m1-measurement.md`).

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **Gantt M2**, once the device answers are in (needs no new spec; the plan has exits per task).
2. **#457**: the nginx security-header fix (small; no spec: it stays inside the row's behaviour).
3. Anything from `docs/BACKLOG.md`; a new feature starts with **feature-analyst**.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **Keep the main checkout detached at `origin/main`** and do branch work in worktrees.
- **`.claude/worktrees/` is excluded via `.git/info/exclude`**, which a container restart clears.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, which
  stops turbo, so `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` and
  `pnpm --filter @repo/api test` on their own afterwards.
- **Local e2e shares one database and one browser.** Never run two Playwright or DB-backed jobs at
  once — including two agents. Hand the DB to one builder at a time, and let read-only reviewers run
  meanwhile. A leftover API on `localhost:3000` from another worktree blocks `e2e-local.sh`.
- **Parallel branches collide on register numbers and the `CLAUDE.md` banner count.** Renumber a new
  `TECH_DEBT.md` row on rebase, and recompute the banner (`check:counts`).
- **A PR title over ~93 characters fails `pr-title.yml`** once GitHub appends ` (#NNN)`.
- **CodeQL flags regex HTML stripping even in tests**; parse with `DOMParser` instead.
- **`gh pr list` is blocked (GraphQL 403)** — use `gh api repos/HuttonHomeHub/SchedulePoint_1/...`.
- **Playwright in the container:** `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. CDP cannot
  synthesise a stylus or the OS long-press; those are device checks.
- **Commit bodies are limited to 100 characters per line** (commitlint).
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
- **The safety check refuses `rm -rf` of a top-level path** (a builder left `/ngx` and
  `/e2e-staff.log` from an unset `$TMPDIR`); harmless in an ephemeral container.
