# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-13, after the GUI-fixes session of 2026-11-12/13 closed at **web 1.8.0 and api 1.2.0**. Two
approved plans are **finished and released**: "diagram keys and selection"
([`docs/specs/diagram-keys-and-selection/`](specs/diagram-keys-and-selection/feature-spec.md), ADR-0218 and ADR-0219)
and "the first planner gets the pen" ([`docs/specs/first-planner-gets-the-pen/`](specs/first-planner-gets-the-pen/feature-spec.md),
ADR-0220). So is the smaller "progress before the data date" ([`docs/specs/progress-before-data-date/`](specs/progress-before-data-date/feature-spec.md),
ADR-0217). The owner's **hard rule** still stands: nothing that needs the owner to run or check anything on their
server or devices (a decision question is fine; a test is not). **P6 M5 and M6 still wait for a real P6 export**; do
not offer them.

## What shipped (2026-11-12 and 13)

Every change went through a pull request with the pre-push gate run first and every check read green on the head
that merged. Five releases; the owner's host pulls each one automatically.

- **web 1.4.0 and api 1.2.0 — progress before the data date, and the blank print** (PRs #1326 spec, #1327, #1330,
  #1331, #1332, #1333; release #1328).
  - A refused progress save now names the field and the data date (`details.fields`, `dataDate`, `latestActual` on
    the API's refusal), is shown on that field in plain words, and every refused save in the product is shown beside
    its Save button (`ScopeSaveBar`'s `error` slot, ADR-0217), so at 1024 × 600 it is on screen. Closed
    `docs/TECH_DEBT.md` #583 and #584.
  - The plan's date is called **Data date** in "Edit plan details" and the footer refreshes when it is saved.
  - "Print…" on the diagram waited for nothing and opened a blank page; it now waits for the image (#585 closed).
  - The rule itself (no actual date after the data date) was **kept**, by the owner's choice. Open: #586, moving the
    data date **backwards** is never checked against actuals already reported.
- **web 1.5.0 — the diagram takes the keyboard** (PRs #1334 verification, #1335, #1337, #1338; release #1336).
  A click or drag on the diagram now leaves the keyboard with it (ADR-0218), so Ctrl+Z, Ctrl+C / Ctrl+V, Escape and
  the arrows work straight after a mouse press. Delete or Backspace deletes the selection after the same confirmation
  as the button. Ctrl-click and Shift-click change the selection whether or not you are editing.
- **web 1.6.0 — double-click and the plural bar** (PRs #1339, #1340 measurement, #1342, #1343; release #1341).
  Double-clicking a bar opens its editor (General when you can edit, Progress when you can only report progress).
  With several activities selected the bar reads "N selected" then the actions, Delete last. "Link in sequence…"
  skips pairs already linked and says so quietly when nothing is left to link (it stays pressable on purpose).
- **web 1.7.0 — the selection bar on a short window** (PR #1344; release #1345). On a window up to 44 rem high the
  plan's facts and the quiet "Editing" badge are visually hidden while a selection bar is docked (ADR-0219, shape
  "S-B", the owner's choice; no overflow menu). A "Locked" or lost-lock badge does **not** yield. A bar selected by a
  click is no longer panned with a 60 px margin. Measured at 1024 × 600 (`m5-measurement.md`): the fullest bar
  (15 controls) goes from 5 lines to 3 and the diagram from 200 to 266 px; a plain bar 246 to 286 px. **Still under
  the 350 px floor** while something is selected.
- **web 1.8.0 — the pen arrives on opening** (PRs #1346 test groundwork, #1347, #1349; one release, #1348, held
  until all three steps were merged and reviewed).
  - Opening a plan nobody is editing starts editing straight away for a Planner or Org Admin (one acquire,
    `takeover: false`, once per opening, visible tab only). Stop editing is respected until the plan is reopened.
  - A lease lost to nobody (your own other tab closed, a reload) is retaken once, silently.
  - Whoever pressed Request control starts editing when the holder hands over or leaves.
  - A tab **hidden** for 15 minutes stops renewing its hold; a colleague can take over within about two minutes
    after that. Undo history survives a lost pen (ADR-0176 D4; two older documents that said otherwise now carry a
    "superseded" note).
  - **Why one release:** with the first step alone, anyone opening a plan just to look would have held it with no
    limit (`ux-reviewer`, adopted).
- **The two artifact pages.** The walkthrough's ranked list
  (`https://claude.ai/artifact/RjgG4AFNs9UV61T4jYjgjo`) was brought up to date from the owner's runbook answers
  (94 answers, chapters 1 to 8) and now holds **142 problems**, each marked when fixed with the version that fixed
  it; its top line says the pictures were taken on web 1.1.0. Both first-severity problems that were open are closed.
  The runbook (`https://claude.ai/artifact/5b67drkb6iDK5TG9owVSma`) had its chapter 9 to 12 hints checked against
  web 1.3.0 and corrected, without touching the answers. **Runbook hints for steps changed since** (3.3 double-click,
  3.14 Delete key, 4.1 progress refusal, 7.14 and 8.4 to 8.6 selection and copy, anything saying "press Start
  editing") **have not been re-checked against 1.8.0.**

## Decisions the owner made this session

- Keep the "no actual after the data date" rule; reword journey 2 of the brief; do not separate plan start from
  data date now (a `docs/BACKLOG.md` item records the idea).
- Selection bar on a short window: the bar takes the row, plan facts step aside, no "More" menu.
- A planner who double-clicks without the pen opens Progress.
- Firefox and Safari engines: not now.
- The pen: take it on opening; Org Admins too; let go after 15 minutes hidden; no per-person switch.
- **Standing approval, for the two plans above only,** to merge and release when every check on the current head is
  green, reviewers have nothing blocking and the merge is pinned to a commit ID from GitHub. Both plans are finished,
  so **the next session asks again** before merging anything that is not docs-only.

## What is next

**Updated 2026-11-13 (second session of the day).** When this was written nothing had been built yet. **The owner
answered every question below the same day: yes to each recommendation** (Cancel request with the reload fix; the
idle tab lets go quietly at 30 minutes, spec first; "Ask a Planner"; remember Dismiss; a short-window "let all
follow" action, spec first; shorten the Select hint) **and chose every batch, in the order G, A, B, C, then D, E, F.**

**Two specs written and approved (no code yet):**

1. **"Cancel request"** ([`docs/specs/cancel-request-control/`](specs/cancel-request-control/feature-spec.md),
   `docs/TECH_DEBT.md` #588). `DELETE …/edit-lock/request` (clears only the caller's own request, returns the
   status), a **Cancel request** button beside the waiting "Take over now", and the tab's memory of a request made
   to follow the server's record. No schema change (the two request columns exist). Two milestones: M1 the route
   (api minor), M2 the button and journey (web minor). ADR-0220 gains a D7; no new ADR.
   **Found while checking, and fixed by the spec's Q1 if approved:** after a reload the requester still reads "you
   will start editing when {Name} hands over or leaves", but the reloaded tab no longer takes the plan when the
   holder merely leaves (`use-plan-edit-lock.ts`, `requestedOf` starts empty); and a tab whose request was replaced
   by a later requester can still race for the freed plan. An Org Admin is never offered Request control
   (`lock-view.ts`: override is checked first), so Cancel is a Planner's control on screen.
2. **Wording for people who cannot edit** ([`docs/specs/read-only-wording/`](specs/read-only-wording/feature-spec.md)).
   The empty plan says "Ask a Planner to add activities." for a Viewer or Contributor, through an optional
   `form: 'ask'` on `scheduleRefusal` (the panel still does not learn the role). Eleven sentences change in all,
   including every leftover "edit lock" (`use-plan-workspace-model.ts`, `unsaved-work/report.ts`, `RolesPanel`,
   `ProgrammeScheduleSection`, and `NeedsAttentionSection.tsx` "You are holding the editing lock.", which the last
   hand-off missed). One of them was wrong, not just old: the selection bar says "Take the edit lock…" even when a
   colleague is editing. Web patch, two small milestones, accessibility review in a browser before release.

**Questions put to the owner on 2026-11-13:**

3. **A visible, unattended tab.** Options put: leave it (a colleague can already Request control and take over
   after the 45-second grace, so the plan is never stuck); let go quietly after a period with no mouse or keyboard
   input in the tab (recommended: 30 minutes, no prompt, resumes on the next input); or an "Are you still
   editing?" prompt (not recommended: it interrupts reading). A yes needs a spec.
4. **Three "Follow logic" choices:** remember Dismiss per device after a reload (recommended yes); a whole-plan
   action on a short window (recommended: inside the conflict review, not a strip; needs a short spec); shorten
   the Select tool's hint ("Marquee select · drag to select, Ctrl to add · Esc to stop", `CanvasModeBand.tsx`)
   so it fits one line at 1024 px (recommended yes, measured in a journey).
5. **Which batch next.** All 57 open second-severity problems on the walkthrough list were checked against the
   1.8.0 code by reading it (no browser): **1 fixed** (rank 74, the SF link, by the 1.2.0 offer; an SF case was
   not run), **3 partly fixed** (21, 61, 75; 46 also partly, by 1.8.0), **5 changed** (40, 41, 51, 56 and 34
   slightly), **6 need a browser to tell** (20, 42, 43, 47, 49, 53), the rest still open. The per-item evidence is
   in the three tables this session produced; the walkthrough page itself was **not** updated with these verdicts.
   Batches proposed by screen: quick copy fixes across screens; home, members and invitations; plan set-up
   (new plan, calendar dialog, schedule settings); baseline and progress feedback on the plan; Gantt; share page;
   import; and a "needs a browser first" group.

**The runbook** (`https://claude.ai/artifact/5b67drkb6iDK5TG9owVSma`) had 32 hints corrected against web 1.8.0 by
reading the code (double-click, the Delete key, keys after a drag, Ctrl-click, "3 selected", every "press Start
editing", and the hand-over wording in chapter 12). Step 3.1's goal and the "expect" lines of 7.14, 8.4 and 12.6
were also corrected, because they described behaviour that has changed. The 94 answers were not touched and none
is newer than 2026-11-11, so the problem list gained nothing.

**Known and recorded, not started:**

- `docs/TECH_DEBT.md` **#586** (data date moved backwards is unchecked), **#587** (an administrator's force-release
  would be undone by the released editor's silent retake; no screen reaches force-release today) and **#588**
  (specified above, not built).
- At 1024 × 600 the diagram with a selection is still 64 to 84 px under the 350 px floor.
- When the pen is lost to a colleague the sentence can be announced twice: first "Someone else is now editing…",
  then with the name once the status read lands.
- Two suggestions from `security-reviewer`, neither a defect: mark automatic acquires in the lock's log line (needs
  an API field), and give `POST …/edit-lock` its own rate limit.

**Not verified anywhere this session:** Firefox, WebKit, real touch hardware, a real screen reader, a real
15-minute wait (the journey uses a fake clock). The accessibility reviews of the short-window bar (1.7.0) and of
the hidden-tab step were code reads; the other pen steps and the keys work were run in Chromium.

Other candidates, each needing the owner's say, are unchanged: making the Baseline criticality columns NOT NULL
(a schema change, so `database-architect` first), and the optional dev-time audit overrides.

## The owner's deployment (canonical until the product scales)

The full description is [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), "The owner's deployment". In short: Dockge, stack
folder `/apps/schedulepoint`, project `schedulepoint`, services `db` / `api` / `web` / `backup` / `watchtower`
(containers `schedulepoint-*`), **bind-mount folders** `/apps/schedulepoint/db` and `/apps/schedulepoint/backups`
(not named volumes), web on 8080 behind a reverse proxy at `https://schedulepoint.huttonhomehub.co.uk`, and a
terminal that is **root inside a container** (no `sudo`). Do not write down the values of `MAIL_ALERT_URL`,
`HEARTBEAT_URL` or any secret; ask the owner if one matters.

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
  `j5.js` for the journeys, `r1.js` to `r12.js` for the runbook chapters, `run.js`; `node run.js r4 1024`), saved
  beside the storyboard artifact as `scripts/*.txt` with `BRIEF.md`, the written brief the scripting agents worked
  from. `sprites.py` joins each step's two screenshots into one image (the artifact allows 511 files; there are 427
  images), and `build.js`, `template.html` and `findings.json` build the page. Set-up data goes in through the REST
  API from inside the page; everything photographed is real clicks and typing.
- **Things the walkthrough had to learn about the diagram.** There is no test hook for where a bar is: the scripts
  click-probe the canvas and read the selection bar's name. Selecting a bar at 1024 × 600 shrinks and scrolls the
  canvas, so clear the selection (Escape, or click an empty part of the diagram; before web 1.5.0 Escape did
  nothing after a mouse press, which was the focus defect ADR-0218 fixed) and
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
- **The container restarted once during the walkthrough extension** (2026-11-11, about three hours in). The
  scratchpad survived; Postgres, the two servers and a running agent did not. Publish finished work to the artifact as
  it completes, and have agents write their results to files, not only into their final message.
- **Three `builder` agents scripted nine chapters in parallel against one running app** without colliding, because
  each script signs up its own user and organisation. `mapBars` in `h.js` probes rows on a 60 px pitch and clears any
  selection first; probing every 12 px made one chapter take an hour.
- **One remote branch, and a worktree to push from** (2026-11-12/13). GitHub deletes the session's branch on each
  squash-merge. What worked: builders commit on a local branch in the main tree; a second worktree, detached at
  `origin/main`, cherry-picks those commits, runs `scripts/prepush.sh` and pushes `HEAD` to the session's branch.
  Only one pull request can be open at a time, so stack the next change locally and replay it after the merge.
- **`check:counts` fails whenever a change adds web source files or an ADR.** Fix the number on line 23 of
  `CLAUDE.md` to the one the gate prints (it re-derives it), re-run `check:counts` and `check:format`, and commit.
  Two changes built in parallel will both edit that line: take either side, then set the printed number.
- **A change to the foot row or the dock must also run `web:minimap`.** The short-window bar (#1344) made a premise
  of `e2e-minimap/viewport-cluster.spec.ts` false (it named 1024 × 500 as "no room"); CI caught it, the local list
  of nine wider suites did not. That journey now shrinks the window until the column is withdrawn.
- **The roster is 51 web suites; a builder's "whole estate" was 34.** CI runs them all, so read the shards.
- **Tests seen to fail once and pass untouched**, each on a loaded machine: `e2e-workspace-chrome/dock.spec.ts`
  ("the follow-logic offer at 200 % text") and `conflict-review.spec.ts` ("shows one reason at a time") on a slow
  CI runner (PR #1343, green on one re-run); `ClientsTable.test.tsx` ("hands focus to the list…") during a local
  pre-push. `e2e/throttle-visibility.spec.ts` prints two ✘ lines that the suite expects.
- **The pen in journeys:** every journey takes it through `apps/web/e2e-support/pen.ts` (`holdThePen`,
  `releaseThePen`, `expectPenFree`). Since 1.8.0 opening a plan as a Planner already holds it, so a journey that
  needs it free must release first. On an SS link with a lag the lag handle is drawn over the attachment dot while
  editing, by design; `e2e-netpoint-grammar/links.spec.ts` measures with the pen released for that reason.
- **Playwright's fake clock:** use `page.clock.fastForward` for long spans (`runFor` fires every timer and times
  out), and do not call `page.waitForTimeout` under it (it hangs).
- **The container restarted twice in this session.** Commits and uncommitted edits survived; running processes,
  background waits and agents did not. An interrupted agent can be resumed by sending it a message; the GitHub
  tools and `SendMessage` have to be loaded again first.
- **Do not call `list_triggers` to check a wake-up**: its output is enormous. Carry the state in the wake-up's own
  message and keep one armed at a time.
- **Brief builders to run whole unit folders and never to chain `git commit` after a test command.** A builder that
  ran single files shipped a failing neighbour test into a pre-push run.
- **A reviewer that runs the component finds what a code read does not.** Twice this session
  `accessibility-reviewer`, run in Chromium, found a live region saying "Checking who’s editing…" in the middle of
  a change that should have been silent; both are now pinned by a journey that records the region's text.
- **Do not run a gate as `pnpm -s check:…`.** The silent flag reaches the pnpm calls inside
  `scripts/prepush-push.test.mjs`'s fixtures, an exit code 2 comes back as 1, and `check:doc-register` fails on
  "an advisory WARN still pushes" with nothing wrong in the tree (2026-11-13). `pnpm check:doc-register` passes.
