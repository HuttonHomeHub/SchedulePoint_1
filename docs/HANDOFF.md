# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-08 evening, after the **minimum-viewport epic** (ADR-0179,
`docs/specs/minimum-viewport/`). Product owner on 2026-10-08: _"i want to drop the phone aspect from
this whole application … a laptop / 11inch tablet at the very lowest"_; approved with "approve, go with
all four recommendations" and "keep 1024, half-screen is fine with continue".

## Where things stand

- `main` holds everything below. Latest releases: **web 0.178.0** and the M4 release that followed
  it, **web 0.179.0**, **api 0.88.1** (unchanged in code).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- The previous hand-off was accurate when checked (main ended with #888; web 0.177.5, api 0.88.1; no
  open PRs; no wake-ups; `.claude/worktrees/` already excluded).

## What this epic shipped

| PR   | What                                                                                                                                                                                                                                                                                                                                                                                                            | Release     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| #889 | Spec, plan and ADR-0179 (approved). Four reviewers (a11y, UX, component, ui-architect) agreed on a second pass.                                                                                                                                                                                                                                                                                                 | none        |
| #890 | **M0** floor readings (`m0-measurement.md`, 16-entry payoff list) and **M1**: the rules now say "designed from 1024 × 600 up; content still reflows below"; ADR-0179 Accepted; ADR-0029/0118 amended; #438 closed.                                                                                                                                                                                              | none        |
| #891 | **M2**: gates measure the floor (1024 × 600 fine and coarse), 390 retired, narrow-shell at 640 × 480, staff not-found at 320, splitting coarse project is a 1180 × 820 tablet. Fix found by the floor: the Explorer column and the activities panel scroll so nothing is drawn below a 600 px window.                                                                                                           | web 0.178.0 |
| #893 | **M3**: below 1024 in the signed-in app, a "designed for larger screens" page (native `<dialog>` beside the shell) on load/navigation, a slim polite banner on a live narrowing. Continue anyway persists per device; Not now / Escape / Dismiss are visit-only. `BrandCard`, `useNativeModal`, `DESIGNED_MIN_WIDTH_QUERY`, the `tall` variant; canvas Escape listener ignores keys under an open native modal. | web 0.178.0 |
| #894 | **M4 fit at the floor**: one-row header at 1024 (`lg:max-w-1/2`), Explorer width clamped so the stage keeps 720 px (stored width untouched), `short` and `wide` variants, deck 2 lines at 1280 (was 3). Canvas at 1024 × 600: 226 → 274 px. Before/after PNGs in `docs/specs/minimum-viewport/m4/`.                                                                                                             | web 0.179.0 |

## Waiting on the product owner

- **Two layout options M4 deliberately did not build** (both reviewed):
  1. Drop the Summary, Calendar and Export labels below 1280 for a 3-line deck at 1024 (+44 px of
     diagram). **UX reviewer recommends against** (ADR-0117; least self-evident icons); an overflow
     `⋯` is the better route if wanted.
  2. Under ~660 px of height, let the diagram give way so the expanded activities panel shows rows
     (**#468**). **Recommended**; needs a short spec (it changes a layout rule).
- **The history count on or after 1 November** (ADR-0174 / #443): staff console → Tools → **Run
  diagnostics** → **Copy results**. Record it in #443 and the activity-history plan's M3-T2.
- **Gantt hands-on readings** are still owed (unchanged).
- The Surface sheet (`docs/specs/gantt-coarse-pointer/device-checklist.md`) is unaffected by this
  epic: no Gantt touch, stylus, menu or target behaviour changed.

## Decisions to put to the product owner (none approved)

1. The two options above.
2. Named follow-ups from the plan, each needing its own spec (ADR-0105): **retire the below-`md`
   single-pane workspace** (needs a11y agreement that the command band counts as a kept-in-view
   toolbar under 1.4.10); **#333** landing two columns from `xl`.
3. Anything from `docs/BACKLOG.md`; the Gantt residue is now **#439** and **#215** (#438 closed).

## New and open rows from this epic

- **#466** — at 320 px the activities row `⋯` sits under the bottom panel's bar (keyboard-reachable).
- **#467** — the account chip's Sign out uses native `disabled` while pending (focus drops to body).
- **#468** — at 1024 × 600 the expanded activities panel shows no rows (658 > 600 px).
- Unchanged: **#456**, **#454**, **#449**, **#450**, **#440–#446**, **#435**, **#432**, **#429**,
  **#419**, **#405**, **#439**, **#215**. `wip/history-numerator-preaggregate` (`64ff45d4`) is still
  the first remedy to measure when the 250,000 trigger fires.

## Environment notes a new session would otherwise rediscover

- **`send_later` works in a session the product owner started** (depth reset). Arm it as the first
  action of each turn; re-arm only on a firing; `list_triggers` before arming out of band.
- **The shell now always mounts an empty `role="status"` live region** (the narrow-window banner,
  ADR-0179). Any e2e locator `getByRole('status')` on a signed-in page must be scoped
  (`.filter({ hasText })` or a container), or it hits a strict-mode violation. #893 fixed the two that
  broke (`audit.spec.ts`, `account.spec.ts`).
- **Signed-in e2e below 1024 must opt in** to `test.use({ acknowledgeViewportNotice: true })` or call
  `acknowledgeViewportNotice(page)` from `apps/web/e2e-support/test.ts`; otherwise the notice covers
  the page. Only the notice's own journeys leave it off.
- **`plan-switch.spec.ts:109` fails intermittently under local load** (a 30 s timeout in `newPlan()`),
  2–3 times in this epic, always passing alone and in CI. Recorded under **#435**.
- **A stale API server on :3000 poisons later local runs** (429s while seeding). Before a run,
  `curl -s localhost:3000/api/v1/health` should return nothing; kill only that pid.
- **CodeQL flags `new StorageEvent('storage', { key })`** as superfluous arguments and stat-then-read
  directory walks as a race; use `apps/web/src/test/storage-event.ts` and
  `readdirSync(dir, { withFileTypes: true })`.
- **`check:counts` trips on every new web source file** (the `CLAUDE.md` banner count); update it in
  the same commit.
- **The container restarts without warning** and kills agents; files in worktrees, pushed branches and
  wake-ups survive. Brief builders to commit and push after every step (`chore(web): wip …`, never a
  bare `wip`).
- **`.claude/worktrees/` must be in `.git/info/exclude`** in each fresh container.
- **An interrupted e2e run can leave `ops@schedulepoint.test` unverified**:
  `PGPASSWORD=app psql -h localhost -U app app_test -c "update users set email_verified=true where email='ops@schedulepoint.test'"`.
- **Never let two Playwright or DB-backed runs overlap**; brief every agent to check
  `pgrep -f "playwright test|e2e-local"` first, or tell reviewers not to run e2e.
- **The Version Packages PR's checks never run** (`action_required`); merge it after reading its diff.
  Find the release run with
  `gh api repos/HuttonHomeHub/SchedulePoint_1/actions/workflows/release.yml/runs?head_sha=<sha>`.
- **`gh api …/jobs/<id>/logs` is blocked by the proxy**; use the GitHub MCP `get_job_logs` with
  `return_content` (the tail is often service-container noise; ask for ~330 lines).
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, so
  `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` on its own.
- **Setup per worktree:** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate`. Keep the main checkout detached at `origin/main`.
- **Chaining a build on an unmerged branch works**: after the base squash-merges,
  `git rebase --onto origin/main <old base tip>` and force-push with lease.
- **A PR title over ~93 characters fails `pr-title.yml`**; commit bodies ≤ 100 characters per line.
- **ADR-0131's spec gate reads the first word of `Status:`**; an ADR citing a Draft spec's path fails
  `check:spec-status` S3.
- **Playwright in the container:** Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
