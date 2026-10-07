# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-07, after the **estate polish** batch (spec #861, approved 2026-10-06 with the
"Page not found" item included): TECH_DEBT #459, #460 and #461, and the staff console's quiet Refresh.

## Where things stand

- `main` holds everything below. Latest releases: **web 0.177.0, api 0.88.1** (check the tags).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- The previous hand-off was accurate when checked (main ended with #860; web 0.176.0, api 0.88.0;
  no open PRs; no wake-ups).

## What this batch shipped

| PR   | What                                                                                                                                                                                                                                                     | Release                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| #861 | Spec + plan `docs/specs/estate-polish-oct/`; four reviewers (a11y, component, UX, security) agreed on a second pass.                                                                                                                                     | none                    |
| #862 | **M1a** (#460 closed): `Button`'s CVA owns the `aria-disabled` look (`opacity-60`, hover gated `not-aria-disabled:`); the fifteen resting pointer-inert sites take the pointer and refuse in their handlers; submits refuse in `onClick` and `onSubmit`. | web 0.176.1             |
| #864 | **M1b** (#461 closed): caller shading strings deleted from 54 files; `SHADED_BUTTON` and `AssignmentRow`'s hidden inert class gone; gate **G1** scans whole files for the shading spellings.                                                             | web 0.176.2             |
| #866 | **M2**: a staff-console Refresh speaks once (`StatusMuteProvider` / `useStatusMuted`, ADR-0178 D8); a rejected Refresh unmutes.                                                                                                                          | web 0.176.3             |
| #868 | **M3** (#459 closed): one `NotFoundScreen` for every address that is not a page (router `notFoundMode: 'root'`, staff non-staff branch); the API answers Nest's own 404 with `Not found`.                                                                | web 0.177.0, api 0.88.1 |

Filed this batch: **#462** (the empty canvas's "Draw the first activity" reason is screen-reader
only) and **#463** (a signed-in mistype under `/orgs/<slug>/` now renders outside the shell — an
in-shell variant needs a spec and must stay indistinguishable for non-members).

## Waiting on the product owner

- **The Surface test sheet is still PARKED** (`docs/specs/gantt-coarse-pointer/device-checklist.md`).
  Standing instruction unchanged: a change to anything it tests updates the sheet in the same PR. Its
  answers decide **Gantt M2**. Nothing in this batch changed what it tests (each PR says why).
- **The history count on or after 1 November** (ADR-0174 / #443): staff console → Tools →
  **Run diagnostics** → **Copy results**. Record it in #443 and the activity-history plan's M3-T2.
- **Gantt hands-on readings** are still owed (unchanged).
- **Worth a look on the Surface:** shaded buttons now dim to 60 % everywhere (they were 50 % on the
  public forms and notes); the reviewers judged it still reads as unavailable.

## Decisions to put to the product owner (none approved)

1. **Gantt M2** (after the Surface sheet), and anything from `docs/BACKLOG.md`.
2. **#462** (a visible reason beside the empty canvas's button) and **#463** (an in-shell not-found)
   — both small, both need a decision before work; #463 needs a spec (ADR-0105).

## Open rows unchanged this batch

**#456**, **#454**, **#449**, **#450**, **#440–#446**, **#435** (e2e flake count), **#432**, **#429**,
**#419**, **#405**. ADR-0177 stays Proposed until D4 at Gantt M2. `wip/history-numerator-preaggregate`
(`64ff45d4`) is still the first remedy to measure when the 250,000 trigger fires.

## Environment notes a new session would otherwise rediscover

- **The container restarted three times in one night (2026-10-07) and every restart killed the
  running agents and background tasks.** What survived: files on disk in worktrees, pushed branches
  and `send_later` wake-ups. So: tell builders to **commit a WIP and push after every substantial
  step**; after a restart run `list_triggers`, `git worktree list` and `git -C <worktree> status`,
  save uncommitted work as a WIP commit, push it, and resume (squash the WIPs onto the milestone
  base before the PR). Short milestones that fit between restarts were finished directly rather than
  through a new builder.
- **An interrupted e2e run can leave test data that breaks the next one.** The staff journey creates
  `ops@schedulepoint.test`; a run that stops between sign-up and verification leaves it unverified,
  and the resend is throttled, so the next run waits for mail that never comes. Fix in the local DB:
  `service postgresql start`, then
  `PGPASSWORD=app psql -h localhost -U app app_test -c "update users set email_verified=true where email='ops@schedulepoint.test'"`.
- **Never let two Playwright or DB-backed runs overlap** (one database, one set of ports). Brief
  every agent that may run e2e — reviewers included — to check `pgrep -f "playwright test|e2e-local"`
  first; a reviewer overlapped a builder's run once this batch.
- **`check:claims` gates a spec too:** a dependency-internal `file.js:line` citation in a doc must be
  registered in `scripts/dependency-claims.json` (the spec PR failed CI on this once).
- **Playwright refuses `click({ trial: true })` on any `aria-disabled="true"` control**, so a journey
  proves a shaded button keeps the pointer with `elementFromPoint` at its centre plus a forced click.
- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **Keep the main checkout detached at `origin/main`** and do branch work in worktrees; brief every
  builder to work only inside its worktree path and to check `git -C <main checkout> status --short`
  is empty before editing. `.claude/worktrees/` is excluded via `.git/info/exclude`.
- **Chaining milestones on unmerged branches works**: base the next builder on the previous branch,
  then after the squash-merge `git rebase --onto origin/main <old tip>` and force-push with lease.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, which
  stops turbo, so `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` and
  `pnpm --filter @repo/api test` on their own afterwards.
- **Parallel branches collide on register numbers and the `CLAUDE.md` banner count.**
- **A PR title over ~93 characters fails `pr-title.yml`** once GitHub appends ` (#NNN)`.
- **CodeQL flags incomplete regex escaping even in tests** — escape the full metacharacter set.
- **`gh pr list` is blocked (GraphQL 403)** — use `gh api repos/HuttonHomeHub/SchedulePoint_1/...`.
- **Playwright in the container:** Chromium binary `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Commit bodies are limited to 100 characters per line** (commitlint).
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
