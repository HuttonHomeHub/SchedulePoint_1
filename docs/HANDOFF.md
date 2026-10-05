# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-05, at the end of the **best-in-class undo/redo** epic (M0–M8) and the
"edited since it was calculated" fix. **Updated later on 2026-10-05** with two bug fixes from the
product owner (below); the next job is unchanged.

## Where things stand

- `main` holds everything below. Latest releases: **web 0.170.3, api 0.87.1**.
- **No approved work is waiting.** Everything the product owner approved on 2026-10-04 has shipped.
- **First job of the next session: the reconciliation pass** (`docs/RECONCILE.md`, ADR-0058). It is
  due at this epic boundary and was deliberately deferred so it gets a fresh session of its own.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## Bug fixes on 2026-10-05 (after the epic)

Both were product-owner reports, fixed and released the same day; ledgered as closed rows.

| PR   | What                                                                                                                                                                                                                                                                                                      | Release                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| #827 | **#451**: opening another plan counted as an edit ("N edits not calculated"). The plan route re-rendered instead of remounting on a `$planId` change, so the workspace model outlived its plan. `PlanDetailScreen` now keys the model on org + plan. Journey: `e2e-workspace-chrome/plan-switch.spec.ts`. | web 0.170.2             |
| #829 | **#452**: the overview said "Edited since it was calculated" while the opened plan said nothing. `PlanSummary.editedSinceCalculated` (shared rule `isEditedSinceCalculated`) now drives the status bar too. Journey: `e2e-workspace-chrome/edited-since.spec.ts`.                                         | web 0.170.3, api 0.87.1 |

Worth knowing for the reconciliation pass: `PlanSummary` gained a field, so `docs/API.md` and the
structural reader roster in `schedule-inputs.structural.spec.ts` were updated in #829.

## What shipped on 2026-10-03 → 2026-10-05

Undo/redo epic — spec and plan `docs/specs/undo-redo-best-in-class/` (Accepted, ADR-0176):

| PR        | What                                                                                                   | Release     |
| --------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| #792      | Fix (a): replay against the row's latest version (#447) — undo no longer stops after one step          | web 0.163.1 |
| #793      | Fix (b): a keyboard nudge no longer re-sends a committed edit when the plan closes (#448)              | web 0.163.1 |
| #795      | M0: every undo/redo that changes the schedule recalculates                                             | web 0.163.2 |
| #797      | M1: the dock strip under the diagram says what undo/redo did                                           | web 0.164.0 |
| #801      | M2: check-then-write — a step that no longer applies is set aside and explained; history survives pens | web 0.165.0 |
| #803/#804 | M3: undo covers the create dialog, outline, steps, assignments and links (API returns delete batch id) | web 0.166.0 |
| #817      | M6: dissolving a summary is one undo step instead of wiping the history                                | web 0.167.0 |
| #819      | M4: an undo/redo selects and reveals what it changed, in the diagram and the Gantt                     | web 0.168.0 |
| #821      | M5: Ctrl+Z / Ctrl+Y work anywhere in the plan and leave text boxes alone                               | web 0.169.0 |
| #823      | M7: **Recent edits** menu beside Undo — undo or redo several steps at once                             | web 0.170.0 |
| this PR   | M8: `VITE_UNDO_REDO` retired; specs closed; roadmap updated                                            | next patch  |

Also: **#799** — the overview's "Edited since it was calculated" flag now reads a new
`plans.schedule_inputs_changed_at` column stamped only when a scheduling input changes (calendar
edits deliberately left out — product owner, 2026-10-04; see #449). Earlier in the same session:
#760 route splitting (ADR-0171), #762/#770 started-activity refusals, #764/#766 resource-group
dissolve, #768/#772/#774/#776, Gantt column widths #778/#781 (ADR-0173), the 429 journey guard
#779/#783/#791 (ADR-0175), and activity history #784/#787/#789 (ADR-0174).

## Open rows that need a decision or a trigger

- **#449**: calendar and resource-limit edits do not mark plans "edited since calculated" (left out
  by decision); plus a small stamp race. Pick up only if the product owner asks.
- **#450**: a single `DELETE` carries no version, so undo's check-then-delete has a small window;
  also assignments, LOE rollback residue, dissolve version and audit.
- **#440–#446** (filed with activity history): deadlock risk between placement and recalc writes,
  baseline count subquery, `PanelResizer` single-pointer alternative, history cost measured only on
  the container, batch probe width, stale neighbour names, per-address throttling behind NAT.
- **History row-rate count is owed around 1 November** (ADR-0174 / #443): re-measure on the live host.
- **Gantt hands-on readings** are still owed by the product owner.
- **#431** remainder, **#433**, **#435**, **#432**, **#429**, **#419**, **#405** unchanged.
- **Ten Dependabot PRs (#807–#816)** are open. Not merged — nobody asked; put them to the product owner.

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. The reconciliation pass (due now).
2. The Dependabot batch.
3. **#433**: measure plan refresh on the live server.
4. Anything from `docs/BACKLOG.md`; a new feature starts with **feature-analyst**.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **Keep the main checkout detached at `origin/main`** and do branch work in worktrees, so the main
  checkout never shares a branch with a worktree. Push with `HEAD:refs/heads/<branch>`.
- **`.claude/worktrees/` is excluded via `.git/info/exclude`**, which a container restart clears;
  re-add it or the stop hook reports untracked files. A restart also kills running agents —
  checkpoint their work as WIP commits and relaunch.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only.**
  `check:reconcile-due` warns on a shallow clone; that is expected. Because the interchange failure stops turbo, run
  `pnpm --filter @repo/web test` and `pnpm --filter @repo/api test` on their own afterwards.
- **Playwright in the container:** set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` (the
  bundled headless shell version is not installed). A spec filter is a regex on the full path, so
  a worktree whose name matches it runs the whole suite — use `-g "<test title>"` instead.
- **Local e2e shares one database.** Never run two `scripts/e2e-local.sh` jobs (or vitest) at once;
  wait with `until ! pgrep -a node | grep -qE "vitest|playwright"`. Clear `apps/web/node_modules/.vite`
  first. Agents must not run Playwright.
- **Rate limits in suites are measured ceilings** (#791): a suite that 429s needs its config's
  `RATE_LIMIT_LIMIT` re-measured with `E2E_THROTTLE_CENSUS=1`, not removed.
- **`gh pr list` is blocked (GraphQL 403)** — use `gh api repos/HuttonHomeHub/SchedulePoint_1/...`.
  Check `gh api rate_limit` before bursts; the REST limit was hit once.
- **`check:counts` re-derives the CLAUDE.md banner numbers.** Adding web source files fails it.
- **Commit bodies are limited to 100 characters per line** (commitlint), as well as PR title + " (#N)".
- **No Firefox in the container** — Chromium only.
- **Building on an unmerged PR in a worktree works**: after the squash-merge, move the follow-on
  commits with `git rebase --onto origin/main <old-tip>`.
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
