# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-09, after **1.1.0 was released and the owner's server was switched to it**. The fresh-start
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
  carries a patch changeset for `@repo/api`, so the Release workflow will open a **Version Packages** PR.

## The owner's deployment (canonical until the product scales)

The full description is [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), "The owner's deployment". In short: Dockge, stack
folder `/apps/schedulepoint`, project `schedulepoint`, services `db` / `api` / `web` / `backup` / `watchtower`
(containers `schedulepoint-*`), **bind-mount folders** `/apps/schedulepoint/db` and `/apps/schedulepoint/backups`
(not named volumes), web on 8080 behind a reverse proxy at `https://schedulepoint.huttonhomehub.co.uk`, and a
terminal that is **root inside a container** (no `sudo`). Do not write down the values of `MAIL_ALERT_URL`,
`HEARTBEAT_URL` or any secret; ask the owner if one matters.

## What is next

Nothing is approved. Candidates, each needing the owner's say:

1. **The Version Packages PR** that #1297's changeset opens (an `@repo/api` patch). Its checks read
   `action_required` or `failure` with no job body run, which is expected (`CLAUDE.md` §11); merging it publishes the
   API image and Watchtower pulls it on the owner's host, so it is the owner's call, and the web image does not move.
2. **`docs/TECH_DEBT.md` #577** (13 dead test mocks for a retired flag, and two unused flag helpers; trigger: the next
   change to those tests or the next proposed flag).
3. **Whether to make the Baseline criticality columns NOT NULL.** #576 was the stated reason they stayed nullable and
   it is closed; the remaining cause is a plan never recalculated. A schema change, so `database-architect` first, and
   an owner decision.
4. The remaining audit entries (`brace-expansion`, `browserslist`, `minimatch`, `baseline-browser-mapping`,
   `mysql2`, `deepmerge-ts`) are dev-time or unused; overrides for them are optional tidiness.
5. The **perf-probe** and **`providers.tsx`** notes in the watch list.

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
- The clone starts shallow. `git fetch --unshallow origin main` makes `check:reconcile-due` and the reconciliation's
  day-one-file query meaningful (1,205 commits).
- `scripts/e2e-local.sh api` takes no file filter: it is the whole suite, about 15 minutes.
- This session's branch is `claude/vibrant-dijkstra-tmdl7x`, the only branch it may push to; GitHub removes it when the
  pull request merges, so start the next session's branch from `origin/main`.
