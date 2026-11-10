# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-09, brought up to date 2026-11-10 (after #577 shipped as PR #1302, then the owner's choice of the next session's work), after **1.1.0 was released and the owner's server was switched to it**. The fresh-start
epic ([ADR-0215](adr/0215-a-fresh-start-is-a-new-database-and-the-image-refuses-the-old-one.md), spec and plan in
[`docs/specs/fresh-start-1-1/`](specs/fresh-start-1-1/feature-spec.md)) is **closed**. The owner's **hard rule**
still stands: nothing that needs the owner to run or check anything on their server or devices (a decision
question is fine; a test is not). **P6 M5 and M6 still wait for a real P6 export**; do not offer them.

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
- **One branch, `main`** — 2026-11-10. Five branches whose work was already in `main` (`fix/project-delete-import-race`,
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

## The owner's deployment (canonical until the product scales)

The full description is [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), "The owner's deployment". In short: Dockge, stack
folder `/apps/schedulepoint`, project `schedulepoint`, services `db` / `api` / `web` / `backup` / `watchtower`
(containers `schedulepoint-*`), **bind-mount folders** `/apps/schedulepoint/db` and `/apps/schedulepoint/backups`
(not named volumes), web on 8080 behind a reverse proxy at `https://schedulepoint.huttonhomehub.co.uk`, and a
terminal that is **root inside a container** (no `sudo`). Do not write down the values of `MAIL_ALERT_URL`,
`HEARTBEAT_URL` or any secret; ask the owner if one matters.

## What is next

**The owner's chosen next session (2026-11-10): a GUI review, before any GUI fine-tuning.** It is two tasks, in this
order, and neither changes the product:

- **First, a manual runbook for the owner.** A step-by-step script of what a user does, from sign-up to a shared and
  baselined plan, which the owner works through themselves and answers step by step. Each step states a **goal**,
  not where to click ("make the second activity wait for the first", never "press the + button"), because a step that
  names the control hides exactly the "I could not find it" problems the review is for. Each step has what the user
  should end up with, an Easy / OK / Struggled answer, a notes box, and a hidden hint so being stuck never blocks the
  rest. It is split into chapters of about 20–30 minutes (getting in; setting up; building a plan; running a plan;
  sharing and output; deeper features), chapters 1–3 first. It is built as an artifact page that **saves the owner's
  answers** (the artifact `db` capability), so a later session reads the feedback directly. Every step is checked
  against the real app before it is written: a goal the product cannot do wastes the owner's time.
- **Then, an automated walkthrough** of the five user journeys in `docs/PROJECT_BRIEF.md` §10, driven in a real browser
  with a screenshot at every step at 1024 × 600 (ADR-0179) and 1440 × 900, published as a scrollable storyboard, then
  reviewed by `ux-reviewer` and `accessibility-reviewer` into one ranked list of GUI problems, cross-referenced with
  the owner's runbook answers. It is **one-off**: scripts and screenshots stay in the scratchpad. Keeping it in the
  repository adds a Playwright config, an ADR-0105 trigger, so that needs a spec and the owner's approval first.

No fixes until the owner picks them from the ranked list. The owner does the runbook because they **chose** to use
their own product; it is not a test the session needs them to run, so it does not break the hard rule above.

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
