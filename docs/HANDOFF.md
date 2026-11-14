# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-14, after the session of 2026-11-13/14 closed at **web 1.16.0 and api 1.5.0** (it opened at
web 1.8.0 and api 1.2.0). **Every item the owner approved in that session is built, merged and released.** The
owner's **hard rule** still stands: nothing that needs the owner to run or check anything on their server or devices
(a decision question is fine; a test is not). **P6 M5 and M6 still wait for a real P6 export**; do not offer them.

**The standing approval has ended.** The owner gave it on 2026-11-13 for that day's approved work (merge and release
when every check on the current head is green after dedupe, reviewers have nothing blocking, and the merge is pinned to
a commit ID from GitHub). That work is finished, so **the next session asks again** before merging anything that is not
docs-only.

## What shipped (2026-11-13 and 14)

Every change went through a pull request with the pre-push gate run first and every check (eleven names, five of them
web shards) read green on the head that merged. Releases: web 1.9.0 to 1.16.0, api 1.3.0, 1.3.1, 1.4.0 and 1.5.0.
The owner's host pulls each one automatically.

- **The pen follow-ups.** A **Cancel request** button and `DELETE …/edit-lock/request`, with the tab's memory of a
  request following the server's record (#1352, #1354; `docs/TECH_DEBT.md` #588 closed). A plan left idle in a visible
  tab for 30 minutes is let go quietly and taken back on the next input (#1362, ADR-0220 D8).
- **Wording.** Read-only messages say "Ask a Planner…" and no screen says "edit lock" (#1355); eight confusing screens
  reworded (#1358); the Select tool's hint fits one line at 1024 wide (#1361).
- **Follow logic.** A dismissed whole-plan offer is remembered on this browser (#1357). On a short window, where the
  dock has no room for the offer, **Follow logic in the selection bar gains an arrow offering "Let all bars follow"**
  (#1382, web 1.16.0). Measured first (`docs/specs/follow-logic-follow-ups/m3a-measurement.md`): the arrow adds no line or height
  at 1024 × 600 — but the plan's premise that the bar sits on one line was wrong; with eleven controls it already wraps
  to three. The same change fixed a real defect in the shared announcer: two messages in one frame lost the first, so
  Follow logic's outcome was never heard behind the focus hand-off. Messages in one frame are now joined in order, each
  spoken once, and a standing count can be marked `transient` so it never prefixes the real announcement
  (`components/ui/announcer.tsx`). A split button's pressed state became optional, so Follow logic and Go to today are
  no longer announced as toggles. **CI caught two things the first push got wrong, both fixed in the same PR:** the
  join read two quick, separate key presses together ("No successors. No predecessors.", `e2e/tsld.spec.ts`), so a
  key press or pointer press now starts a new announcement and only what one press caused is joined; and
  `e2e-splitting/splitting.spec.ts` excluded the idle onboarding warm-up by that chunk's name only, so the chunks it
  imports (`members`, `overview`, `ui-shared`, two copy modules) counted as a third wave whenever the idle callback
  fired late. The warm-up set is now derived from the build (the onboarding chunk's imports minus the entry's).
- **Batches by screen** (the walkthrough's second-severity list): home, members and invitations (#1359); setting up a
  plan (#1364); baseline comparison and progress reading (#1366); the Gantt timeline gets room on a narrow window, two
  columns hidden and Activity starting at its 120 px floor (#1372, the owner's choice after the 40 % measure missed);
  the client's shared page tidied and a picked activity's facts shown, with float as "Total float" (#1378).
- **The plan finish against the baseline** (#1368 api, #1376 web): `meta.projectFinishVarianceDays` and a slip fact
  in working days, shown **only when it fits** (it yields when the dock is in use, the schedule is not current, or
  below `sm`) — the owner's choice after the M0 measure fired its stop rule.
- **Invitations survive email confirmation** (#1370 api, #1374 web; ADR-0221): a confirmed address can list and accept
  its waiting invitations, and they are offered after sign-in.
- **The activity name stays in view** when the activities table scrolls sideways, from 1024 wide (#1380, web 1.15.0;
  ADR-0146 D3 amended).

## Decisions the owner made this session

- Every recommendation on the 2026-11-13 question list (Cancel request; idle tab lets go at 30 minutes; "Ask a
  Planner"; remember Dismiss; a short-window "let all follow"; shorten the Select hint); batches in the order G, A, B,
  C, then D, E, F.
- Slip fact: "working days", shown only when it fits. Pinned names: Name only. First client: leave as it is. Guest:
  a picked activity's facts, float as "Total float". Gantt: hide two columns on narrow windows, reset the divider once
  for everyone, "narrow" means the Gantt's own space is tight, Activity starts at its floor; the late bar note stays.

## What is next

Nothing approved is waiting. Candidates for the owner, none started:

**Batch G (the "needs a browser" group) was checked in Chromium; verdicts, no fixes made.** Ranks are the walkthrough
list's (`https://claude.ai/artifact/RjgG4AFNs9UV61T4jYjgjo`, not updated with these):

| Rank | Verdict          | What was seen                                                                                                                                                          |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20   | Still open, S    | A one-day or zero-length task draws as two touching circles at Week and Month zoom.                                                                                    |
| 42   | Still open, S    | The Codes dialog's right pane clips the Add value form at 1024 × 600; it scrolls, with empty space below.                                                              |
| 43   | Fixed            | Nothing overlaps the bottom bar.                                                                                                                                       |
| 47   | Still open, M    | With touch at 1024 × 600 the toolbar takes about 0.43 of the height in four rows; the canvas about 0.37, against 0.59 with a mouse.                                    |
| 49   | Still open, S/M  | The calendar editor scrolls sideways at 1024 with 200 % text (weekly-hours buttons past the edge): the same defect as `docs/TECH_DEBT.md` #592, whose row now says so. |
| 53   | Cannot reproduce | The control dims to pale blue as designed; in forced colours the button outline is lost.                                                                               |

**Known and recorded, not started:** `docs/TECH_DEBT.md` #586 (data date moved backwards is unchecked), #587
(force-release undone by a silent retake; unreachable today), #592 (calendar editor reflow, above), #593 (a baseline's
`capturedProjectFinish` is the network finish), #594 (invitations read by address scans the table; an index is a
`database-architect` decision). At 1024 × 600 the diagram with a selection is still under the 350 px floor. Runbook
hints for steps changed since 1.8.0 have not been re-checked.

**Not verified anywhere this session:** Firefox, WebKit, real touch hardware, a real screen reader.

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
- **Never run the pre-push gate beside Playwright or another vitest run** (2026-11-14). The machine runs out of memory
  (exit 137) or timing tests fail under the load. Wait until `ps aux | grep -cE '[c]hrome-linux64/chrome'` reads 0,
  then run `scripts/prepush.sh` alone.
- **Worktrees per change, one to push from.** This session's builders each worked in their own worktree
  (`/home/user/sp-build2` … `sp-build6`); `/home/user/sp-push`, reset to `origin/main`, took each change with
  `git diff $(git merge-base origin/main BRANCH) BRANCH -- . ':!CLAUDE.md' | git apply --3way --index`, so
  `CLAUDE.md` (counts and ADR lines) was edited by hand there and never conflicted.
- **After a merge GitHub removes the session's branch**, so the next push needs the full name:
  `scripts/prepush.sh --push -u origin HEAD:refs/heads/<branch>`. A bare `HEAD:<branch>` is refused by the dry run.
- **Serialise browser runs through a queue.** A small script in the scratchpad ran one `scripts/e2e-local.sh` target
  after another and wrote a summary line each, so builders never started two at once.
- **Wake-ups can arrive late** (tens of minutes). Keep exactly one armed and delete the old one before arming another
  out of turn.
