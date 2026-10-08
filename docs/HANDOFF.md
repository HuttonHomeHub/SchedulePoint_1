# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-08, after the **#462 / #463** batch and its follow-ons: the matching not-found
screens, the Surface test sheet answered, **Gantt M2 + #464** (product owner: "go ahead with Gantt M2
and #464", then "C and accept"), the #464 follow-up for blank space (**#464 closed** on the device),
and **#465** (the Gantt's date header overprinting).

## Where things stand

- `main` holds everything below. Latest releases: **web 0.177.5, api 0.88.1** (check the tags).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- The previous hand-off was accurate when checked (main ended with #870; web 0.177.0, api 0.88.1;
  no open PRs; no wake-ups), except that `.claude/worktrees/` was **not** excluded in a fresh
  container — see the environment notes.

## What this batch shipped

| PR   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Release     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| #871 | **#462 closed** (register-row fix, no spec): without the pen, the empty canvas's notice says "Start editing this plan to draw activities." visibly, inside its wrapping message, still the shaded button's `aria-describedby`.                                                                                                                                                                                                                                                                                                                 | web 0.177.1 |
| #873 | Spec + plan `docs/specs/in-shell-not-found/`; four reviewers (security, a11y, component, UX) agreed on a second pass.                                                                                                                                                                                                                                                                                                                                                                                                                          | none        |
| #874 | **#463 closed**: a member's mistyped `/orgs/<slug>/…` renders "Page not found" inside the shell (splat `/orgs/$orgSlug/$`, `routes/org-not-found.tsx`); non-member and nonexistent slugs keep the root page, identical for every path shape; signed out → sign-in with the full path. Also: `orgHomeRoute` is now an index route (`/orgs/$orgSlug/`, the trailing slash is load-bearing), shared `Breadcrumbs` marks only the last crumb current, `PageHeader` gains `headingFocusRef`, and the sign-in `redirect` sanitiser rejects `/\host`. | 0.177.2     |
| #877 | Surface test sheet answers recorded (`docs/specs/gantt-coarse-pointer/device-results.md`); TECH_DEBT #464 filed.                                                                                                                                                                                                                                                                                                                                                                                                                               | none        |
| #878 | A missing plan, project or client shows a calm "<Entity> not found" like the in-shell page (404 only); any other load error says "couldn't load" with **Try again**. `routes/entity-not-found.tsx`.                                                                                                                                                                                                                                                                                                                                            | web 0.177.3 |
| #879 | Gantt M2 re-scoped by the device: M2-T1/T3 dropped; M2-T2 24 × 24 arrow, option C; M2-T5 for #464. Four reviewers agreed twice.                                                                                                                                                                                                                                                                                                                                                                                                                | none        |
| #881 | **Gantt M2 shipped**: the summary arrow is a 24 × 24 target beside the name, with the indent, in the Activity column (bucket rows aligned with Code shown or hidden; `GanttCell` gains a Gantt-local `lead` so nothing moves while editing); a `data-last-input` attribute makes idle cell text `select-none` after a touch/stylus press (#464); coarse gate covers the Gantt grid with four exemption kinds; **ADR-0177 Accepted**.                                                                                                           | web 0.177.4 |
| #884 | **#464 closed**: the touch `select-none` variant moved from the cell text spans to each row's whole table half (off on a row with an open cell), so a hold on blank space inside a row reaches the row menu. Device 12b passed on 0.177.5 in all three runs.                                                                                                                                                                                                                                                                                   | web 0.177.5 |
| #885 | **#465** (new row): the Gantt's month labels thin to every 2nd month, quarter, year or k-th January as space requires (`MONTH_LABEL_MIN_PITCH_PX` 64, calendar-aligned); a line stays at every month. Print uses the same builder.                                                                                                                                                                                                                                                                                                             | web 0.177.5 |

## Waiting on the product owner

- **Confirm #465 on the monitor**: the plan from the 2026-10-07 screenshot, zoomed to fit, should
  show readable month labels. #465 closes on that answer.
- The Surface sheet (`docs/specs/gantt-coarse-pointer/device-checklist.md`) stays the record of what
  is tested: a change to anything it tests updates it in the same PR. Items 6 and 12 have passed. The
  Surface runs at **1912 × 1114 CSS px (DPR 1.5)**; the monitor at **1912 × 948 (DPR 1, mouse
  only)**.
- **The history count on or after 1 November** (ADR-0174 / #443): staff console → Tools →
  **Run diagnostics** → **Copy results**. Record it in #443 and the activity-history plan's M3-T2.
- **Gantt hands-on readings** are still owed (unchanged).
- **Worth a look on the Surface:** shaded buttons dim to 60 % everywhere (from the last batch), and a
  mistyped address inside an organisation now stays in the app.

## Decisions to put to the product owner (none approved)

1. Anything from `docs/BACKLOG.md` (rewritten by Gantt M2: #464's device check, #438, #439, #215).
2. Optional follow-ups noted by reviewers, not filed as work: a shared "Go to the organisation
   overview" link component (it is duplicated in `org-not-found.tsx` and `entity-not-found.tsx`);
   name width at WBS depth 4–5 (about 80–95 px of the Activity cell before the text).

## Open rows unchanged this batch

**#465** (until confirmed), **#456**, **#454**, **#449**, **#450**, **#440–#446**, **#435** (e2e flake count), **#432**, **#429**,
**#419**, **#405**. `wip/history-numerator-preaggregate`
(`64ff45d4`) is still the first remedy to measure when the 250,000 trigger fires.

## Environment notes a new session would otherwise rediscover

- **`send_later` is refused once a session chain is eight deep** ("lineage depth 8 (limit 8)"), and
  this session hit it, so it could arm no wake-ups at all. A session started fresh by the product
  owner (rather than by another session) resets the depth. If the tool refuses, say so to the product
  owner, keep everything inside the turn, and rely on agent and PR notifications to resume.
- **The container restarts without warning and kills running agents and background tasks.** What
  survives: files in worktrees, pushed branches and `send_later` wake-ups. Tell builders to **commit
  a WIP and push after every substantial step** (commitlint refuses a bare `wip`: use
  `chore(web): wip …`); after a restart run `list_triggers`, `git worktree list` and
  `git -C <worktree> status`, save uncommitted work as a WIP commit, push it, and resume.
- **`.claude/worktrees/` must be added to `.git/info/exclude` in each fresh container**
  (`echo ".claude/worktrees/" >> .git/info/exclude`), or the stop hook reports untracked files.
- **An interrupted e2e run can leave test data that breaks the next one.** The staff journey creates
  `ops@schedulepoint.test`; a run that stops between sign-up and verification leaves it unverified,
  and the resend is throttled. Fix: `service postgresql start`, then
  `PGPASSWORD=app psql -h localhost -U app app_test -c "update users set email_verified=true where email='ops@schedulepoint.test'"`.
- **Never let two Playwright or DB-backed runs overlap** (one database, one set of ports). Brief
  every agent that may run e2e — reviewers included — to check `pgrep -f "playwright test|e2e-local"`
  first, or tell reviewers not to run e2e at all while you do.
- **GitHub can refuse a job re-run with a 500** (both the MCP tool and `gh api …/rerun-failed-jobs`).
  A CI job that dies before any test body (e.g. a 30-minute `apt` install on a slow mirror) then needs
  a genuine new commit to re-run; never an empty one.
- **On 2026-10-07 evening the `Install Playwright browsers` step stalled for ~30 minutes** on web
  shard 2 (both #884 and #885), hitting the job timeout before any test ran; it recovered within the
  hour (2.7 minutes). Read the job's step timings (`list_workflow_jobs`) before calling a timeout a
  test problem.
- **PR notifications can go missing**: #885's green CI produced no wake. When a run should have
  finished, read `get_check_runs` rather than waiting.
- **`gh api …/jobs/<id>/logs` redirects to a blob host the proxy blocks**; use the GitHub MCP
  `get_job_logs` with `return_content` instead.
- **A change to `/orgs/*` routing or a shared layout primitive** warrants the base `web` journey plus
  `web:shell`, `web:overview`, `web:page-composition` and `web:narrow-shell` (about 7 minutes run one
  after another).
- **`check:claims` gates a spec too:** a dependency-internal `file.js:line` citation in a doc must be
  registered in `scripts/dependency-claims.json`.
- **ADR-0131's spec gate reads the first word of `Status:`** — keep "approved in principle" in a
  separate `Decision:` line, or a draft reads as approved.
- **Playwright refuses `click({ trial: true })` on any `aria-disabled="true"` control.**
- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **Keep the main checkout detached at `origin/main`** and do branch work in worktrees; brief every
  builder to work only inside its worktree path and to check `git -C <main checkout> status --short`
  is empty before editing.
- **Chaining a build on an unmerged spec branch works**: base the build worktree on the spec branch,
  then after the spec's squash-merge `git rebase --onto origin/main <spec tip>` and force-push.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, which
  stops turbo, so `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` (and api)
  on their own afterwards.
- **Parallel branches collide on register numbers and the `CLAUDE.md` banner count.**
- **A PR title over ~93 characters fails `pr-title.yml`** once GitHub appends ` (#NNN)`.
- **CodeQL flags incomplete regex escaping even in tests** — escape the full set, or write the
  character as a URL escape in test input.
- **`gh pr list` is blocked (GraphQL 403)**; `gh api repos/HuttonHomeHub/SchedulePoint_1/...` (REST)
  works, including `actions/workflows/release.yml/runs?head_sha=<sha>` to find the release run.
- **Playwright in the container:** Chromium binary `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Commit bodies are limited to 100 characters per line** (commitlint).
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
