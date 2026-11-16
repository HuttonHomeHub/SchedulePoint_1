# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-16, after the session of 2026-11-16 closed at **web 1.17.2 and api 1.6.0** (it opened at web
1.17.1 and api 1.5.0). **Every problem runbook section 1 raised is built, merged and released**, and runbook section 2 is
written on the page and clicked through against that release. The owner's **hard rule** still stands: nothing that
needs the owner to run or check anything on their server or devices (a decision question is fine; a test is not).
**P6 M5 and M6 still wait for a real P6 export**; do not offer them.

**Approval to merge.** The owner's instruction ("fix and release everything [a runbook section] finds") covers merging
and releasing that work when every check on the current head is green after dedupe and the merge is pinned to a full
commit ID from GitHub. It does not cover new features: those still need a spec and the owner's approval (ADR-0105).

## What shipped (2026-11-16, #1404, released as web 1.17.2 / api 1.6.0 by #1405)

From the owner's section 1 answers (artifact `https://claude.ai/artifact/Xqj9p8czyV6byEJjxw2htF`, `db` collection
`answers`, ids `1-01` … `1-11`, `1-overall`):

- **A reset link says on arrival whether it still works** (1.9). Spec `docs/specs/reset-link-check/`, approved
  2026-11-16. `POST /api/v1/password-reset/check` (public, 10/min, token in the body, answers only `{ usable }`, never
  consumes). First app use of `auth.$context.internalAdapter`; ADR-0074's amendment limits app code to its read
  methods and says a better-auth bump must re-run the reset e2e cases and `check:claims` (Dependabot #1397 bumps
  better-auth: that rule applies to it).
- **Branded HTML emails** with a plain-text copy (overall), hand-written in `apps/api/src/common/mail/mail-templates.ts`;
  the logo is `/brand/mark-email.png` on the link's own origin; role and expiry written in words; "an hour".
- **The owner's logo** from the SchedulePoint_Website repo (1.1): `BrandMark` renders `/brand/mark.svg`; favicon,
  32 px PNG and Apple touch icon replaced. ADR-0077 §3 amended. The website repo is public and readable by `git clone`
  through the session proxy (add_repo answers "read_available").
- **"You have been signed out." clears** on a sign-in attempt (1.7).
- **One message per problem** (1.2): `FormProblemCount` is screen-reader only, and the 13 other forms that used
  `FormErrorSummary` now use it too.
- Found while walking section 2, fixed before it was written: stale "N projects"/plan counts after create/delete; a
  refused "remove member" now shows inside its dialog; the empty-plan calendar hint no longer names a Recalculate
  button that is not there.

## What is next

1. **The owner is doing runbook section 2** ("Setting up", 14 steps: organisation, members and invitations, client,
   project, calendar, plan) on the same page. Answers save to `answers` as `2-01` … `2-14` and `2-overall`. **No parked
   list** (owner's rule): fix and release every problem it raises (spec first where ADR-0105 applies), then write
   section 3 (drawing the plan: activities, links, the diagram) against the release with those fixes, clicked through
   in a real browser first. Edit the page by reading it back (`Artifact` `read` with `path: index.html`) and adding to
   its `SECTIONS` array.
2. **Things section 2 may raise, already seen:** signing up from an invitation does not fill in the invited address;
   "Add your first client" opens the Clients page rather than the new-client box; the `Standard` calendar is 24 hours
   per day (whole days); the plan count on a project page does not refresh after activities change in the workspace
   (left to the default stale time).
3. **Dependabot has ten PRs open (#1394–#1403)**, untouched this session.

**Recorded, not started:** `docs/TECH_DEBT.md` #586, #587, #592, #593, #594 (as before). At actual size (zoomed
readers, ADR-0222 D9), coarse 1024 × 600 is still under its floor with three deck rows. The Gantt wheel travels 0.75×
at 0.75 scale. Real browser zoom is detected in Chromium only.

**Not verified anywhere this session:** Firefox, WebKit, real touch hardware, a real screen reader, and the branded
emails in a real mail client (they were checked rendered in Chromium and as received by a local SMTP sink).

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
- **Fresh worktrees need `pnpm turbo run build --filter='./packages/*'`** before the API will start for e2e.
- **The real-zoom journey launches full Chromium** (`channel: 'chromium'`) when `PLAYWRIGHT_CHROMIUM_PATH` is unset;
  Playwright's default headless shell ignores a seeded profile's zoom levels (#1388's first CI run).
- **A control that passes 2.5.8 only by the spacing exception can fail on CI's fonts and pass locally** (Recalculate,
  #1388). Give it a real 24 px.
- **Kill dev servers an agent leaves behind** before `scripts/e2e-local.sh`, which refuses to run while 3000 or 5173
  answer; check `ps` for `apps/api/dist/main` and `vite` from other worktrees.
- **After a merge the hook complains about unpushed commits** because GitHub deleted the session branch. Resetting the
  branch to `origin/main` and pushing it quiets it.
- **Click-throughs with real email, no Docker** (2026-11-16): `/tmp/claude-0/sp/smtp.js`-style 30-line Node SMTP sink
  on port 2525 writing each message to a file, with the API started with `MAIL_SMTP_URL=smtp://localhost:2525`,
  `MAIL_FROM=…` and `AUTH_REQUIRE_EMAIL_VERIFICATION=true`. Decode quoted-printable before matching links. Point a
  restarted sink at a fresh folder: it numbers files from 1 again, and the session's safety check refuses `rm` on a
  relative glob.
- **`scripts/e2e-local.sh` stops Postgres when it finishes.** Restart it with `--db-only` before starting the API by
  hand again.
- **One combined pull request worked well for a runbook section**: builders in their own worktrees, then
  `git cherry-pick` into one push worktree; the only conflicts were new entries at the top of `docs/DECISIONS.md`
  (keep both) and the count on `CLAUDE.md` line 23.
- **The Version Packages PR showed `total_count: 0` check runs on 2026-11-16** (#1405), not the `action_required`
  runs §11 describes; nothing ran either way.
