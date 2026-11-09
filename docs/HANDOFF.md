# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-09, after **1.1.0 was released and the owner's server was switched to it**. The fresh-start
epic ([ADR-0215](adr/0215-a-fresh-start-is-a-new-database-and-the-image-refuses-the-old-one.md), spec and plan in
[`docs/specs/fresh-start-1-1/`](specs/fresh-start-1-1/feature-spec.md)) is **closed**. The owner's **hard rule**
still stands: nothing that needs the owner to run or check anything on their server or devices (a decision
question is fine; a test is not). **P6 M5 and M6 still wait for a real P6 export**; do not offer them.

## What shipped

- **1.1.0, "the fresh start"** — PR #1292 (`feat(release)!`, merge `1deffb7e`) and the Version Packages PR #1293
  (merge `bad52e5b`), both merged 2026-11-09. Tags `api-v1.1.0` and `web-v1.1.0`; Release run `42629151456`
  green on all three jobs (version and tag, publish api, publish web).
- **What 1.1.0 is:** one baseline migration (`20261109000000_baseline_1_1`) and a boot `preflight` that refuses a
  pre-1.1 database without touching it; code and published shapes that only served old rows removed (the
  one-time ADR-0190 exception, organisation export format **3.0**); all 48 web feature flags retired.
  Schema tidy **T7** (`accounts.issuer` default) was **withdrawn**: Better Auth never writes `issuer`, so the
  column keeps its `DEFAULT` (ADR-0107 D2 as amended).
- **The live switch, 2026-11-09** (`docs/DECISIONS.md`, same date). The owner **skipped the practice run** (M4-T2,
  [`m4-rehearsal.md`](specs/fresh-start-1-1/m4-rehearsal.md), recorded as not run) and **discarded all 1.0 data
  by choice**: stack stopped, the database folder moved aside, Dockge **Update**, 1.1.0 started on an empty
  folder, owner signed up and created the organisation again. The old folder has since been **deleted**, so
  **there is no way back to 1.0 data** short of the 1.0 nightly copies still in the backups folder, which only
  the 1.0.0 image can restore and which the 30-day tidy-up removes in time. The owner does not want them back.
- **After the switch:** staff console reachable (once the owner's address was confirmed), mail sending,
  first 1.1 backup `BACKUP FINISHED` then `CHECK PASSED` (1 organisation, 1 user), retention hierarchy expiry
  armed as before.

## The owner's deployment (canonical until the product scales)

The full description is [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), "The owner's deployment". In short: Dockge, stack
folder `/apps/schedulepoint`, project `schedulepoint`, services `db` / `api` / `web` / `backup` / `watchtower`
(containers `schedulepoint-*`), **bind-mount folders** `/apps/schedulepoint/db` and `/apps/schedulepoint/backups`
(not named volumes), web on 8080 behind a reverse proxy at `https://schedulepoint.huttonhomehub.co.uk`, and a
terminal that is **root inside a container** (no `sudo`). Do not write down the values of `MAIL_ALERT_URL`,
`HEARTBEAT_URL` or any secret; ask the owner if one matters.

## What is next

Nothing is approved. Candidates, each needing the owner's say:

1. **Dependabot PRs** (ten open, all opened before 1.1.0 merged, so each needs a rebase first). Six are green.
   Four fail only `check:claims`, which refuses a version bump until the cited lines are re-read:
   #1289 better-auth 1.7.14 → 1.7.18, #1291 lucide-react, #1284 dev group (tailwindcss), #1282 nestjs group.
   For #1289 the two `issuer` claims (ADR-0107 D2, schema-design T7) **were checked against 1.7.18 on
   2026-11-09 and still hold word for word at the same lines**; 48 of the 56 better-auth claims hold, 8 have
   moved lines and one anchor's text changed (`sign-in.mjs`, `createEmailVerificationToken` gained a
   `{ userId }` argument). #1286 (`@hookform/resolvers` 6 → 7) is a major bump.
2. **#576** (project delete racing an import; trigger: any change to project delete or import commit), still
   accurate on `main`. #575 (dead painter and gesture branches) is closed.
3. A **reconciliation pass** (`docs/RECONCILE.md`) is due at this epic boundary.

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
