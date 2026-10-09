# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-09, after the **screen-fit batch** that followed the minimum-viewport epic
(ADR-0179). The product owner approved four plans on 2026-10-08 ("Approved with your recommendations")
and this session built and released all of them, plus two small rows.

## Where things stand

- `main` holds everything below. Latest release: **web 0.183.1** (api unchanged at 0.88.1).
- The product owner's two screens, from `/pointer-check.html`
  (`apps/web/public/pointer-check.js:39`): **monitor 1912 × 948** (mouse) and **Surface 1912 × 1114,
  DPR 1.5** (finger and stylus, 44 px targets). The design floor is **1024 × 600** (ADR-0179); the
  Surface upright reads about 1272 × 1800.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer** (Haiku)
  searches, planners are Opus. Never send implementation to `general-purpose`.

## What this batch shipped

| PR(s)            | What                                                                                                                                                                                                                                                             | Release                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| #897, #898, #899 | Approved specs, then **ADR-0180**: on a short screen the expanded activities panel takes the whole workspace (the diagram hides until Collapse); #468 closed.                                                                                                    | web 0.180.0             |
| #901, #903, #904 | **Finger-sized rows (ADR-0183)**: the activities row `⋯` and the Explorer tree rows grow to 44 px under a coarse pointer, the hidden-Explorer spine is 53 px touch / 45 px mouse. #467 and #215 closed.                                                          | web 0.181.0 and 0.181.1 |
| #906             | ADR-0183, the 24 px row-checkbox row (#470) and **Surface sheet steps 13–24**.                                                                                                                                                                                   | none                    |
| #907             | **ADR-0181**: the below-768 single-pane workspace and its Diagram/Activities toggle are retired; docks are capped (a dock that cannot leave the diagram 360 px takes the whole row and the diagram waits, inert); Compare revisions now opens on narrow windows. | web 0.182.0             |
| #909             | **ADR-0182**: `PageGrid` splits into two columns on its own width (72rem container query) instead of the viewport, for the landing, Members and the staff console. **The 72rem threshold is provisional** (see below).                                           | web 0.183.0             |
| #911             | `PanelResizer` gets `touch-none`, so a finger drag of any divider follows the finger (#439 closed). **Surface sheet step 25.**                                                                                                                                   | web 0.183.1             |
| #913             | #466 (row `⋯` under the pane bar at 320) closed as not reproducible, with a narrow-shell journey that pins pointer reach of the row `⋯`.                                                                                                                         | none                    |

## Waiting on the product owner

- **Confirm 72rem** for the page-grid split (ADR-0182 reads "Accepted (CQ-2 threshold provisional …)").
  The spec's own rule could not decide it (its subtitle clause fails even at 1912), so the orchestrator
  chose 72rem on the plan-name-wrap evidence under the delegation "CQ-2 by M0 photographs". Cost, in
  the ADR: a 1440 px laptop with the Explorer open gets **one** wide column; boxes wholly visible go
  2 → 1 of 4 at 1024 × 600 and 1280 × 800. An arbitrary `@[69rem]` would keep 1440 in two columns but
  needs one more measurement round at 1400 and 1440.
- **The tap-to-answer page** (<https://claude.ai/artifact/Mw5537uKYi8bXimcMU1kYY>, Surface sheet steps
  13–24; answers land in its `rowchecks` collection, read them with `ArtifactData list`): **no answers
  at 2026-10-09 10:20 UTC.** If more than one of the ten checks misses, or any is a "no", diagnose and fix,
  then record the results in `docs/specs/gantt-coarse-pointer/device-results.md` and the register.
  **Step 25** (dragging a divider with a finger) is on the paper sheet only,
  `docs/specs/gantt-coarse-pointer/device-checklist.md`.
- **The history count on or after 1 November** (ADR-0174 / #443): staff console → Tools → **Run
  diagnostics** → **Copy results**. Record it in #443 and the activity-history plan's M3-T2.
- **Gantt hands-on readings** are still owed (unchanged).

## Open rows from this batch

- **#471** — at narrow widths the app header and wrapped command band take 355–603 px of height, so
  the workspace body has no room (below the 1024 floor). Needs its own spec (ADR-0105). The reason the
  tiny-window criteria of the single-pane retirement were withdrawn.
- **#472** — closed 2026-10-09 by ADR-0184 (`docs/specs/row-subject-truncation/`): a list row's subject
  wraps and never clips. Kept here only so the number is not mistaken for open work.
- **#473** — the Explorer's splitter wrapper fails axe `region`; **#474** — `SectionCard fill` body is a
  tab stop whether or not it scrolls (a shared keyboard change: accessibility-reviewer first, §19.13);
  **#475** — two stale statements (one fixed; the `HANDOFF.md:38` citation in ADR-0179 and the
  minimum-viewport spec now points at a file that no longer holds that line — the readings are above);
  **#476** — a `PanelResizer` grab strip is 25 px, under the 44 px touch preference.
- **#442** — the dividers outside the Gantt have no pointer-only way to set a size (keyboard twin only).
- **#469** (the short-body swap state could be a `useShortBodySwap` hook) and **#470** (24 px row
  checkboxes on touch) from the earlier part of this batch.
- Known and recorded in ADR-0181: a squeezed dock hides the diagram without saying why (follow-up in
  #471); at 320 wide the activities row `⋯` is off screen to the right until the table's own region is
  scrolled sideways (a scrolling data table, optional follow-up to pin it).
- Unchanged: **#456**, **#454**, **#449**, **#450**, **#440–#446**, **#435**, **#432**, **#429**,
  **#419**, **#405**. `wip/history-numerator-preaggregate` (`64ff45d4`) is still the first remedy to
  measure when the 250,000 trigger fires.

## Suggested next

1. The product owner's answers above (72rem, tap page, Surface step 25).
2. Whichever of #471 (shell chrome at narrow widths) or #474 (tab stop) he wants first;
   each needs its own spec. Planning is Opus work; building is Sonnet.

## Environment notes a new session would otherwise rediscover

- **`send_later` works in a session the product owner started.** Arm it as the first action of each
  turn; re-arm only on a firing; `list_triggers` before arming out of band. A fired notification can be
  delivered late (once ~40 minutes).
- **The GitHub MCP tools can disconnect mid-session.** Reload them with
  `ToolSearch select:mcp__github__<name>`; the repo is `HuttonHomeHub/SchedulePoint_1`.
- **Parallel branches collide on shared numbers.** TECH_DEBT row numbers and the `CLAUDE.md` / `README.md`
  banner counts (web source files, ADRs) both clash when two PRs are open; **rebase every PR branch onto
  the latest `origin/main` before opening it** and re-run `pnpm check:counts` and `check:debt-status`.
- **Subagents sometimes have no shell**: files they write are in their worktree and must be committed and
  pushed by someone with one. Brief builders to commit and push after every step
  (`chore(web): wip …`, never a bare `wip`).
- **A fresh worktree needs** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build` and
  `pnpm --filter @repo/api exec prisma generate` before lint will pass.
- **The shell now always mounts an empty `role="status"` live region** (the narrow-window banner,
  ADR-0179). Any e2e `getByRole('status')` on a signed-in page must be scoped.
- **Signed-in e2e below 1024 must opt in** with `test.use({ acknowledgeViewportNotice: true })` or
  `acknowledgeViewportNotice(page)` from `apps/web/e2e-support/test.ts`.
- **`plan-switch.spec.ts:109` fails intermittently under local load** (a 30 s timeout in `newPlan()`),
  always passing alone and in CI. Recorded under **#435**. `web:page-composition` once failed a table-wrap
  scan that ran before its data loaded; a re-run passed.
- **A stale API server on :3000 poisons later local runs.** Before a run,
  `curl -s localhost:3000/api/v1/health` should return nothing.
- **Never let two Playwright or DB-backed runs overlap**; check `pgrep -fa "playwright test --config|e2e-local.sh"`.
- **CodeQL flags `new StorageEvent('storage', { key })`** and stat-then-read directory walks; use
  `apps/web/src/test/storage-event.ts` and `readdirSync(dir, { withFileTypes: true })`.
- **`check:counts` trips on every new web source file** (the `CLAUDE.md` banner count); a new test file
  counts too.
- **The container restarts without warning** and kills agents; files in worktrees, pushed branches and
  wake-ups survive.
- **`.claude/worktrees/` must be in `.git/info/exclude`** in each fresh container.
- **An interrupted e2e run can leave `ops@schedulepoint.test` unverified**:
  `PGPASSWORD=app psql -h localhost -U app app_test -c "update users set email_verified=true where email='ops@schedulepoint.test'"`.
- **The Version Packages PR's checks never run** (`action_required`); read its diff (`get_files`), then merge
  it with its head SHA. Confirm the release with `get_latest_release`; **never** `actions_list
list_workflow_runs` (its output is huge regardless of `perPage`).
- **`gh api …/jobs/<id>/logs` is blocked by the proxy**; use `actions_get get_workflow_job` for step
  timings or the MCP `get_job_logs` (the tail is often service-container noise).
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, so
  `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` on its own.
- **Chaining a build on an unmerged branch works**: after the base squash-merges,
  `git rebase --onto origin/main <old base tip>` and force-push with lease.
- **A PR title over ~93 characters fails `pr-title.yml`**; commit bodies ≤ 100 characters per line.
- **ADR-0131's spec gate reads the first word of `Status:`**; an ADR citing a Draft spec's path fails
  `check:spec-status` S3.
- **Playwright in the container:** Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **The Surface sheet rule:** `docs/specs/gantt-coarse-pointer/device-checklist.md` must change in the
  same PR whenever what it tests changes (touch rows, dividers, targets).
