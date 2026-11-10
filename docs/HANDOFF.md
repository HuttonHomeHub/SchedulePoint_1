# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-09, brought up to date 2026-11-10 (after #577 shipped as PR #1302, then the GUI review session
of the same day), after **1.1.0 was released and the owner's server was switched to it**. The fresh-start epic
([ADR-0215](adr/0215-a-fresh-start-is-a-new-database-and-the-image-refuses-the-old-one.md), spec and plan in
[`docs/specs/fresh-start-1-1/`](specs/fresh-start-1-1/feature-spec.md)) is **closed**. The owner's **hard rule**
still stands: nothing that needs the owner to run or check anything on their server or devices (a decision question
is fine; a test is not). **P6 M5 and M6 still wait for a real P6 export**; do not offer them.

## What shipped

- **1.1.0, "the fresh start"** — PR #1292 and the Version Packages PR #1293, merged 2026-11-09 (tags
  `api-v1.1.0`, `web-v1.1.0`). One baseline migration, a boot `preflight` that refuses a pre-1.1 database, all 48
  web flags retired, organisation export format **3.0**. The owner switched the server to it the same day on a
  fresh, empty database and discarded the 1.0 data by choice (`docs/DECISIONS.md`, 2026-11-09).
- **The ten Dependabot bumps (#1282–#1291)** — one change, PR #1295 (merge `3b2ea050`), at the versions
  Dependabot proposed, with `@hookform/resolvers` 7 included on the owner's say. All ten checks green on the head
  that merged, after one whole-workflow re-run (the first run was marked failed with its API-test and image jobs
  missing; cause not established).
- **#576 closed as not a race, #575 done, and the reconciliation pass run** — PR #1296 (merge `d4599293`).
  #576's premise was wrong (the import holds the project `FOR SHARE`, and the project delete takes its conflicting
  lock before it reads its plans), so it closed with a test assertion and corrected comments instead of a code
  change. #575 deleted the legacy painter modes (`visualRefresh`, `timeTrueLinks`, `linkRouting`) and the
  handle-origin linking path, 59 files, with the live-mode paint output shown byte-identical before and after. The
  2026-11-09 pass found the agent files, about a dozen documents and a dozen register rows still describing retired
  flags or 1.0 shapes; see `docs/DECISIONS.md` (2026-11-09, "The reconciliation pass at the 1.1.0 boundary").
- **Two hardening fixes the pass suggested** — PR #1297 (merge `8ee9c0a4`): `pnpm.overrides` for `dompurify`,
  `fast-uri`, `qs` and `seroval` (`pnpm audit --prod` 37 to 16 advisories, none critical; the 16 left are dev-time
  tooling, the unused `mysql2` adapter and Prisma's config loader), and a new boot refusal, `other_schema`, for a
  `DATABASE_URL` that names a schema other than `public` (`docs/DECISIONS.md`, "Four dependency overrides…"). It
  carries a patch changeset for `@repo/api`; the Version Packages PR it opened was merged the same night as #1298
  (`9ac6882a`, its Release run succeeded), so nothing from it is pending.
- **One branch, `main`** — 2026-11-10. Five branches whose work was already in `main`
  (`fix/project-delete-import-race`,
  `claude/vibrant-dijkstra-tmdl7x` and three closed `dependabot/…` updates) and `wip/history-numerator-preaggregate`
  were deleted by the owner on GitHub (the cloud session's proxy refuses branch deletion). The one commit the wip
  branch held, a possible speed-up for the staff-console history counts, is kept as
  `docs/specs/staff-server-readings/m1-preaggregate-numerators.patch` (PR #1300, merge `d798a4d7`): **not measured and
  not adopted**, and it is still the first remedy to try if the history counts pass about 250,000 rows (gate S-4 would
  need widening, an ADR-0105 trigger). Decision-log entry: `docs/DECISIONS.md`, 2026-11-10.
- **`docs/TECH_DEBT.md` #577 closed** — PR #1302 (merge `38fe4983`), test-only, no changeset, so no release. It
  removed 21 `vi.mock('@/config/env', …)` blocks from web tests (13 set the retired `LIBRARY_SCOPING_ENABLED`; 8
  more, which the row had not counted, only passed the real module back) and rewrote the comments that still described
  a "pinned OFF" native `<select>`, flag-off sibling suites that no longer exist, or `VITE_LIBRARY_SCOPING`.
  `flagDefaultOn`/`flagDefaultOff` were **kept** with their test, as `env.ts`'s docblock argues (ADR-0084). The row is
  in the register's "Closed numbers" ledger. "Flag-off" wording remains elsewhere: 98 files under `apps/web/src`
  (44 of them tests) match `grep -rli "flag-off\|flag off"`. Many are accurate history; it was outside the row and
  not swept.
- **The GUI review, 2026-11-10: two pages, no product change.** Nothing in the repository changed except this file.
  - **The owner's runbook** is the artifact `https://claude.ai/artifact/5b67drkb6iDK5TG9owVSma` ("SchedulePoint
    Runbook"):
    66 goal-phrased steps in six chapters (getting in 8, setting up 14, building a plan 17, running a plan 10,
    sharing and output 9, deeper features 8), each with an Easy / OK / Struggled answer, a notes box and a folded
    hint. Chapters 4 to 6 were written the same evening at the owner's request. Answers are saved in the page's own
    database, collection `answers`, one document per step with id `<chapter>-<two-digit step>` (`3-05`) or
    `<chapter>-overall`, fields `rating` (`easy` / `ok` / `struggled` / null), `notes`, `goal`, `step`, `updatedAt`.
    Read them with the `ArtifactData` tool (action `list`, collection `answers`, that URL). It held no answers when
    this was written.
  - **The automated walkthrough** is the artifact `https://claude.ai/artifact/RjgG4AFNs9UV61T4jYjgjo` ("SchedulePoint
    Walkthrough"): the five journeys of `docs/PROJECT_BRIEF.md` §10, 80 steps each at 1024 × 600 and 1440 × 900, a
    screenshot and a click / key count per step, and one ranked list of 30 GUI problems from `ux-reviewer` and
    `accessibility-reviewer` as its first section (2 that block a task, 19 that slow or confuse, 9 polish; no screen
    reader was run and zoomed views were not tested). The scripts that drove it are published beside the page under
    `scripts/` (see "How the walkthrough was run" below); nothing was committed.
  - **What it found that a reader of the code would not guess** (each seen in a real browser on 2026-11-10, web 1.1.0,
    API 1.1.1): a Contributor's progress save is refused with "An actual date cannot be after the plan's data date",
    and only a Planner can move that date, so journey 2 of the brief cannot be done in the brief's order; the data
    date has no control of its own, it is "Planned start" in "Edit plan details"; at 1024 × 600 that refusal is off
    the screen, so the save seems to do nothing; at 1024 × 600 selecting a bar opens an actions block of three or
    four rows that takes a quarter to a third of the screen and scrolls the diagram; Ctrl+Z does nothing straight
    after a mouse click or drag on the diagram, while the Undo button works (the click leaves focus on `<main>`,
    which neither undo key listener covers); the plan's Calendar box does not open on a click on its text, only on
    its small arrow, typing or the down-arrow; and the brief's "draw a logic line from its finish to a blank spot"
    does not exist (that drag resizes the bar). **None of these is fixed or registered in `docs/TECH_DEBT.md` yet**:
    the owner picks from the ranked list first.

## The owner's deployment (canonical until the product scales)

The full description is [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), "The owner's deployment". In short: Dockge, stack
folder `/apps/schedulepoint`, project `schedulepoint`, services `db` / `api` / `web` / `backup` / `watchtower`
(containers `schedulepoint-*`), **bind-mount folders** `/apps/schedulepoint/db` and `/apps/schedulepoint/backups`
(not named volumes), web on 8080 behind a reverse proxy at `https://schedulepoint.huttonhomehub.co.uk`, and a
terminal that is **root inside a container** (no `sudo`). Do not write down the values of `MAIL_ALERT_URL`,
`HEARTBEAT_URL` or any secret; ask the owner if one matters.

## What is next

**The GUI review is half done: the pages exist, the owner's answers and choices do not.** In order:

- **Read the owner's runbook answers** (how is in "What shipped"). Every "Struggled" and every note is a finding; set
  them beside the walkthrough's ranked list and say which problems the owner found, which the walkthrough found, and
  which both found (the list's "Found by" tag is there for this, and reads "walkthrough" on every row today).
- **Ask the owner which problems to fix.** No fix before they choose. A fix that adds a screen entry point, a
  Playwright config, a shared gate or a schema change needs a spec and plan first (ADR-0105); most of the list is
  smaller than that, and each chosen item wants a `docs/TECH_DEBT.md` row before work starts.
- **The owner asked whether to fix the list before starting the runbook, and was advised not to** (2026-11-10): their
  untouched first impression is the point, and fixing first would lose the "both found" signal. Nothing on the list
  stops chapters 1 to 3. Step 4.1 is written so that the refused progress save is something the owner meets and
  judges, with the way round it (step 4.5, move the data date) in the hint.
- **Two runbook hints rest on reading the code, not on a browser run**: "Move to swimlane…" on the selection bar
  (step 6.4) and what "Flag over-allocated" shows when a resource really is overloaded (step 6.2). Everything else in
  chapters 4 to 6 was done in a browser first. One outlined goal changed: "find out which change caused the finish to
  move" became "find out what has changed since the baseline", because Compare revisions says on screen that it
  cannot attribute a cause.
- **Keeping the walkthrough** as a permanent suite was not proposed and is not approved. It would add a Playwright
  config, an ADR-0105 trigger, so it needs `feature-analyst` and the owner's approval. The session's own view: the
  click-probing it uses to find bars is slow and tied to today's layout, so it is a poor regression test as it
  stands; its value was the pictures.

Other candidates, each needing the owner's say:

1. **Whatever Version Packages PR the next changeset opens.** None is pending now (#1298 was the last). Its checks
   read `action_required` or `failure` with no job body run, which is expected (`CLAUDE.md` §11); merging one
   publishes the image and Watchtower pulls it on the owner's host, so it is the owner's call.
2. **Whether to make the Baseline criticality columns NOT NULL.** #576 was the stated reason they stayed nullable and
   it is closed; the remaining cause is a plan never recalculated. A schema change, so `database-architect` first, and
   an owner decision.
3. The remaining audit entries (`brace-expansion`, `browserslist`, `minimatch`, `baseline-browser-mapping`,
   `mysql2`, `deepmerge-ts`) are dev-time or unused; overrides for them are optional tidiness.
4. The **perf-probe** and **`providers.tsx`** notes in the watch list (neither is work until something changes).

## Watch list

- **Mail at first boot:** the first 1.1.0 boot logged "mail transport is NOT reachable — SMTP verification timed
  out" (`smtp.resend.com:465`); after a stack restart it logged "mail transport reachable". Treated as a
  transient first-boot timeout. If it recurs, it becomes a `docs/TECH_DEBT.md` row.
- **A stale `backups/UPDATE-HELD.txt` dated 2026-10-26** was found on the host (psql could not resolve host `db`,
  a start-up timing issue, not permissions or disk). It is safe to delete. Why it outlived the hold: the script
  removes it only after taking a pre-update copy (`apps/api/backup/schedulepoint-backup.sh`, `cmd_pre_migrate`),
  so a hold that clears on a start with nothing pending leaves it behind. Since 1.1.0 `preflight` runs first and
  refuses an unreachable database (`cannot_read`) without writing the file, so this cause should not recur; a
  database lost between `preflight` and `pre-migrate` still could. Not a register row unless seen again.
- **`apps/web/src/app/providers.tsx` nests `AppErrorBoundary` inside `QueryClientProvider` and `ThemeProvider`**, so
  a throw in either provider is not caught by the app's last-resort error screen. Both are trivial today, so it is a
  note, not a defect (`docs/DECISIONS.md`, 2026-11-09). This lived in #577's row until that row closed; it becomes
  work if either provider gains logic that can throw.
- **Perf-probe readings** taken before `e82bf48a` are not like for like with later ones (the flag retirement
  changed what the probe scenes draw).

## Environment notes

- Cloud container: `pnpm install`, then `pnpm --filter @repo/api exec prisma generate`, before any gate.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm prepush` (web lint needs the bigger heap).
- Playwright: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.
- Docker is not available in the cloud container.
- Do not run Playwright or `scripts/e2e-local.sh` from more than one agent at once: one database, fixed ports.
- **Set `PLAYWRIGHT_CHROMIUM_PATH` for every `scripts/e2e-local.sh web…` run.** Without it Playwright looks for a
  `chromium_headless_shell-1248` build that is not installed and every browser test fails at launch (33 failures in 23
  seconds on 2026-11-09). That is the container, not the change.
- The clone starts shallow (50 commits). `git fetch --unshallow origin main` makes `check:reconcile-due` and the
  reconciliation's day-one-file query meaningful.
- `scripts/e2e-local.sh api` takes no file filter: it is the whole suite, about 15 minutes.
- Push only to the branch the session's instructions name; GitHub removes it when its pull request merges, so start
  the next session's branch from `origin/main`. The repository holds only `main` between sessions; a new
  `dependabot/…` or `changeset-release/main` branch is normal and short-lived.
- **If lint reports hundreds of "cannot be resolved" or "unsafe member access" errors**, the Prisma client was
  generated after eslint cached its result: run `prisma generate`, then
  `find . -name .eslintcache -not -path './node_modules/*' -delete`, and lint again.
- **After deleting a `vi.mock(...)`, check the file still uses `vi`.** An unused `vi` import fails lint, typecheck
  and `check:web-bundle` at once (2026-11-10). A typecheck run straight from `apps/web` also prints "cannot find
  module `@repo/…`" until the workspace packages are built; read the whole output, not its last lines.
- The unit-test half of `pnpm prepush` runs past ten minutes in this container: start it in the background
  (`run_in_background`) rather than under a foreground timeout.
- **How the walkthrough was run** (2026-11-10), so it can be repeated. Database: `SP_E2E_LOG= scripts/e2e-local.sh
--db-only`. API: `pnpm --filter @repo/api exec nest start` with `DATABASE_URL` (the `app_test` URL in that script),
  `BETTER_AUTH_SECRET` (32+ characters) and `RATE_LIMIT_LIMIT=100000`. Web: `pnpm --filter @repo/web dev`. Start the
  two separately: under `pnpm dev` the API answered with `X-RateLimit-Limit: 100`, so the raised limit had not reached
  it. The scripts are plain Node files using the pre-installed `playwright` (`h.js` harness, `common.js`, `j1.js` to
  `j5.js`, `run.js`; `node run.js j3 1024`), saved beside the storyboard artifact as `scripts/*.txt`; `build.js`,
  `template.html` and `findings.json` build the page from their output. Set-up data goes in through the REST API
  from inside the page; everything photographed is real clicks and typing.
- **Things the walkthrough had to learn about the diagram.** There is no test hook for where a bar is: the scripts
  click-probe the canvas and read the selection bar's name. Selecting a bar at 1024 × 600 shrinks and scrolls the
  canvas, so clear the selection (click an empty part of the diagram; Esc never clears a selection, by design) and
  press "Fit to plan" between probes. Rows are not on an exact 60 px pitch at 1024 × 600, so probe every 12 px.
- **Two things the code reading got wrong and the browser corrected.** A new organisation already has a calendar
  called "Standard" and a new plan already uses it (the picker's "None (all days work)" is an option, not the
  default). And a plan is not visible in the Project Explorer until its project is expanded.
- Creating several organisations with the same name eventually fails with "Could not allocate a unique name for this
  organisation." Give test organisations distinct names.
- Importing a file into the project its plan was exported from is refused with "A plan with this name already exists
  for this project", and the import dialog has no way to change the name: import into another project.
- "Print…" calls the browser's own print window directly; "Health check" and "Share…" are toolbar buttons
  at 1440 wide and menu items under "Analysis" and "Share & export" at 1024.
