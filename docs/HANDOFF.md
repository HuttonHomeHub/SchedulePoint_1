# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-14. The session built the owner's **three 1.0 requirements** (decided 2026-10-13):
a tested database backup and restore, the recycle bin's 90-day clear-out made safe to switch on, and a
whole-organisation export. Each had its own approved spec. Every PR was squash-merged with all its
checks green on the pinned head. **1.0 is not cut**; that stays the owner's call (ADR-0190).

## Where things stand

- **Releases this session:** `api` 0.90.0 → 0.94.0 and `web` 0.191.0 and 0.192.0, every tag confirmed
  with `git ls-remote --tags`.
- **By requirement:**

  | Requirement               | Spec                                | PRs                          | Releases                        | `RELEASE_1_0.md` row                  |
  | ------------------------- | ----------------------------------- | ---------------------------- | ------------------------------- | ------------------------------------- |
  | Backup and restore        | `docs/specs/database-backup/`       | #984, #985, #987, #989       | api 0.90.0, 0.91.0              | 5 — built, owner's check owed         |
  | Recycle-bin clear-out     | `docs/specs/recycle-bin-clear-out/` | #990, #991, #993, #995, #996 | api 0.92.0, 0.93.0; web 0.191.0 | 7 — built, **off**; owner switches on |
  | Whole-organisation export | `docs/specs/organisation-export/`   | #997, #998, #1000            | api 0.94.0; web 0.192.0         | 6 — built, owner's check owed         |

- **What changed for the owner and planners:**
  - **Backups:** a `backup` service takes a copy every night and keeps 30 days; the API takes one before
    any update that changes the database and **holds the update** if it cannot; the database port is
    closed in the release compose file; `restore` never overwrites (the old database is kept under a
    new name). CI restores a copy on every change. Nothing runs on the owner's host until they do the
    host steps (below). ADR-0192.
  - **Clear-out:** still **off** (`RETENTION_HIERARCHY_ENABLED=false`). A read-only preview command lists
    what the first run would delete, using the same selection code the delete uses; each delete
    re-checks the item inside its transaction so a restore can never lose to it; when it is on, delete
    confirmations say "…stay in Recently deleted for 90 days, then are permanently removed". ADR-0193.
  - **Export:** an Org Admin presses **Export data** in the left rail → **Download export** and gets one
    ZIP (JSON + CSV per table, `README.txt`, `manifest.json` with counts and checksums), streamed, never
    stored, audited as `privacy.exported`, one at a time per organisation and two at a time per server.
    Format promise: `docs/ORGANISATION_EXPORT_FORMAT.md`. ADR-0194.

## What the owner has to do (in this order)

These are the only things between the three requirements and **Done**. None is a session's job; when the
owner reports a result, record it in `docs/RELEASE_1_0.md` and `docs/DECISIONS.md`.

1. **Backups — host steps and one practice check** (row 5). Guide:
   [`docs/guides/back-up-and-restore.md`](guides/back-up-and-restore.md). Part 1 is about 25 minutes (make
   the folder with `sudo install -d -o 1000 -g 1000 -m 700 backups`, paste the `backup` block, add the
   API's volume lines, delete the `db` port lines, update the stack, confirm `LAST-BACKUP.txt` says OK,
   save `.env` in a password manager); Part 2's `check` is 30–45 minutes. Done when the owner reports one
   `CHECK PASSED` with its date and file name.
2. **Export — download once** (row 6). Guide:
   [`docs/guides/export-your-organisation.md`](guides/export-your-organisation.md), about 10 minutes:
   download your own organisation's export on the server and open one CSV in Excel. If the owner's host
   sits behind Cloudflare or another proxy, a very long export can be cut at that proxy's idle limit
   (`docs/DEPLOYMENT.md`, "The organisation export through a proxy").
3. **Clear-out — switch on, only after step 1 has passed the same day** (row 7). Guide:
   [`docs/guides/switch-on-the-clear-out.md`](guides/switch-on-the-clear-out.md). Irreversible; it ships
   as its own release day by the owner's decision. Run the preview first.

### One open call for the owner (export size)

Measured (`docs/specs/organisation-export/m2-measurements.md`): 10 plans × 2,000 activities exports in
24–27 s as a 30 MB ZIP, with ordinary reads still at 61–94 ms p95. **Extrapolated, not run:** 100 such
plans would take about 4–5 minutes and briefly add ~280 MB to the API's memory, both near the plan's
limits (5 minutes, 256 MB). Typical organisations are far below that. The options, if the owner ever
has an organisation that size: accept it; a Node memory flag on the API container; or a single-read
export with a worker thread (`docs/TECH_DEBT.md` #515, #516). Default: accept, do nothing now.

## Parked by the owner (2026-10-13) — keep, do not raise

The owner parked these (`docs/DECISIONS.md`, 2026-10-13). They are not work for a session, and a session
does not bring them up again until the owner does. When the owner returns to one, the steps are ready:

- **Set up the alerts** with `docs/guides/set-up-alerts.md` (~15 minutes on the host; do the test part at
  a quiet time). When a test alert reaches the owner's phone, close #100.
- **Run the device check sheet** (`docs/specs/pre-1-0-hardening/device-check-sheet.md`, ~1½–2 hours in two
  sittings). The owner replies with one line per step; record the answers in a `device-check-results.md`
  beside the sheet and turn each "wrong" into a row or a fix.
- Older parked items, unchanged: the toolbar "minor tweaks" (#499 — ask which before building), SC-16
  photos, 72 rem confirmation, Surface sheet steps 25, 18b, 25b, 26–28, the history count on or after
  1 November, Gantt hands-on readings, header at 320/640.
- **Decided, do not reopen:** do not cut 1.0 until the owner says; collaborative editing is not in 1.0;
  four web shards (fifth-shard trigger: slowest shard above 1,250 s, median of three runs, or a 30-minute
  timeout); `Start editing` stays plain while the pen is not held; the diagram keeps its own colours
  under a contrast theme (#508).
- The 1.0 checklist lists both parked jobs as "the owner's call" with no position; keep it that way.

## Open rows worth knowing

- **New this session:** #509–#514 (backup follow-ups: no off-site copy, owner-role connection, the
  pre-update copy unmeasured on a large database, no staff-console status, no one-boot override for a
  held update, a possible default database password on old installs),
  #515 (the export builds one in-browser `Blob`; trigger ~250 MB), #516 (the export reads every table
  twice, the unmeasured many-organisation case, and a possible `(organization_id, id)` index — a schema
  change for database-architect), #517 (the export throttle is per address and runs before sign-in; a
  slow client holds a database snapshot up to 10 minutes).
- Still open from before: #507 (no exported OpenAPI file or breaking-change check; owner's call, default
  not for 1.0), #508 (by decision), and the deferred #978 nits (summary band inset assertion, finished
  vs summary computed check, `colourBehind` comment).
- **Not folded from the export reviews, by choice:** a committed assertion that the rail's tree keeps
  ≥ 128 px at 1024 × 600 with seven links (measured 131 px coarse; an eighth link would not fit), and a
  leave-page guard during an export (the page says leaving cancels it).

## Suggested next

Nothing is in flight: no open PRs, no wake-ups armed. Ask the owner what to take next, offering:

1. **Wait for the owner's three host results above**, and record them as they come.
2. **A reconciliation pass** (`docs/RECONCILE.md`): three ADRs (0192–0194) and a new module have landed
   since the 2026-10-12 pass; due at this epic boundary.
3. **Row 9 at the cut** (remove the four deprecated revision-comparison fields) when the owner chooses
   to cut 1.0.
4. The small deferred nits above, as one test PR.

## Environment notes a new session would otherwise rediscover

- **Run every e2e suite that touches what you changed, not just the suite named in the plan.** Two
  CI reds this session came from suites nobody ran locally: View ▾'s height is asserted in
  `web:workspace-fit` (`assertViewPanelFitsTheFloor`, ≤ 420 px at 1024 × 600), and widening the Gantt
  grid moved a row's centre under the divider in `command-surface.spec.ts`. Grep `apps/web/e2e*/` for
  the component or test id before choosing suites.
- **One local database, one DB-backed run at a time.** Builders in parallel worktrees took turns on
  Postgres by an explicit "DB free" hand-off from the orchestrator; non-DB work (code, unit tests,
  lint, reviews) ran in parallel. A builder cannot receive a message mid-run, so it stops and waits.
- **Rebasing parallel branches:** both `docs/TECH_DEBT.md`'s closed ledger and `CLAUDE.md`'s web
  file count conflict between any two PRs that close a row or add a file. Keep both ledger rows (and
  check for a duplicated row when a later commit edited one); the count can merge cleanly and still be
  wrong by one — always re-run `pnpm check:counts` after a rebase.
- **A fresh worktree's `pnpm prepush` fails lint/typecheck** until `pnpm --filter @repo/api exec prisma
generate` has run and stale `.eslintcache` files are deleted. Turbo can stop other test tasks after
  the known `@repo/interchange` failure; run `pnpm --filter @repo/web test` (or `turbo run test
--filter='!@repo/interchange'`) to confirm.

- **`send_later` works in a session the product owner started.** Arm it as the first action of each turn;
  re-arm only on a firing; `list_triggers` can return `[]` while triggers are live. A fired notification
  can be delivered late. **`delete_trigger` the last one when the chain ends.**
- **The GitHub and claude-code-remote MCP tools disconnect and reconnect mid-session.** Reload with
  `ToolSearch select:mcp__github__<name>`; the repo is `HuttonHomeHub/SchedulePoint_1`.
- **`ss` is not installed in the container.** Pick high random free ports with a `python3` socket bind
  check. **Never `pkill` by pattern**: a reviewer's `pkill -f "nest start"` once risked other agents'
  servers; start servers under `setsid` and kill your own **process group**.
- **Isolated stack for a journey:** API —
  `cd apps/api && API_PORT=<p> BETTER_AUTH_URL=http://localhost:<p> CORS_ORIGINS=http://localhost:<vite> DATABASE_URL=postgresql://app:app@localhost:5432/app_test?schema=public BETTER_AUTH_SECRET=local-e2e-secret-at-least-32-characters-long RATE_LIMIT_LIMIT=400 pnpm exec nest start`;
  web — `cd apps/web && VITE_API_URL=http://localhost:<p> pnpm exec vite --port <vite>` (**no `/api/v1`**);
  then `PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_BASE_URL=http://localhost:<vite> PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome … --project=chromium`.
  **Each Playwright config has its own `VITE_` flags and API env — copy them from the config**, and make
  sure no leftover server from a previous suite answers the next one (it cost two builders a false round).
  Run journeys **serially**; parallel runs cause sign-up timeouts.
- **API rate limit:** the activities `POST` is throttled at 100 per 60 s per IP per handler. A suite that
  seeds heavily sets `RATE_LIMIT_LIMIT` in its config's `webServer` env (narrow-shell: 400,
  workspace-chrome: 1250). Local runs hid this for a day.
- **CI renders text slightly differently from this container** (a label measured 103.7 px on CI against
  106.2 here). The promotion width assertion (SC-18a) is therefore one-sided-strict plus a bounded 4 %
  narrower allowance; re-take the JSON on the CI runner (ADR-0128) rather than widening it if it flags a
  label. The 120 px stage-floor assertion in `e2e-minimap/viewport-cluster.spec.ts` has two pixels of
  margin and cannot be confirmed against CI fonts.
- **Text-only 200 % in a journey** uses a CDP `Page.setFontSizes`, kept attached and re-applied if the root
  size reads 16 px (`narrow-shell.spec.ts`, `setDefaultFontSize`). It passed here on both Chromium builds;
  the CI fix `ac49e0a` is the defensive version of a guess — if SC-7 ever reads `16px` on CI again, set the
  default font size as a browser-level preference instead.
- **The account suite needs a random `E2E_SMTP_PORT`**; its default fixed ports collide with other runs.
- **Parallel branches collide on shared numbers.** TECH_DEBT row numbers and the `CLAUDE.md` / `README.md`
  banner counts (web source files, ADRs) clash when two PRs are open; rebase every branch onto the latest
  `origin/main` before opening it and re-run `pnpm check:counts` and `check:debt-status`.
- **Subagents sometimes have no shell**: brief builders to commit and push after every green slice
  (`chore(web): wip …`, never a bare `wip`), and to stage explicit paths only.
- **A fresh worktree needs** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build` and
  `pnpm --filter @repo/api exec prisma generate` before lint will pass; `scripts/e2e-local.sh --db-only`
  starts Postgres.
- **The shell always mounts an empty `role="status"` live region** (ADR-0179): scope any e2e
  `getByRole('status')`. Signed-in e2e below 1024 must opt in with `acknowledgeViewportNotice`.
- **`plan-switch.spec.ts:109` flaked** under load; the `newPlan` helper had a race (it skipped the project
  link click if the Explorer had not drawn it) and now waits for whichever of the link or the "New plan"
  button appears first (fixed; #435 is now closed).
- **A stale API server on :3000 poisons later local runs** (`curl -s localhost:3000/api/v1/health` should
  return nothing). Never let two DB-backed runs overlap.
- **CodeQL flags `new StorageEvent('storage', { key })`** and stat-then-read directory walks; use
  `apps/web/src/test/storage-event.ts` and `readdirSync(dir, { withFileTypes: true })`.
- **`check:counts` trips on every new web source file** (the `CLAUDE.md` banner count); a new test file
  counts too. Adding an ADR also moves the ADR count.
- **The container restarts without warning** and kills agents; pushed branches and wake-ups survive.
  **`.claude/worktrees/` must be in `.git/info/exclude`** in each fresh container.
- **The Version Packages PR's checks never run** (`action_required`); read its diff (`get_files`), then merge
  it with its head SHA. **Never** `actions_list list_workflow_runs` (its output is huge).
- **`gh api …/jobs/<id>/logs` is blocked by the proxy**; use the MCP `get_job_logs` — its tail is mostly
  Postgres service-container noise, so delegate log reading to a read-only agent and filter for
  `✘` / `Error:` / `Expected` / `Received`.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, so
  `pnpm prepush` reports `FAILED: test`; `check:reconcile-due` warns on the shallow clone. Both are
  pre-existing. Run `pnpm --filter @repo/web test` on its own.
- **A PR title over ~93 characters fails `pr-title.yml`**; commit bodies ≤ 100 characters per line.
- **ADR-0131's spec gate reads the first word of `Status:`**; an ADR citing a Draft spec's path fails
  `check:spec-status` S3.
- **Playwright in the container:** Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (also `chromium_headless_shell-1194`). Never run `playwright install`.
- **The Surface sheet rule:** `docs/specs/gantt-coarse-pointer/device-checklist.md` must change in the
  same PR whenever what it tests changes (touch rows, dividers, targets).
- **A tooling auto-commit can sweep staged files into a commit titled `chore(...): wip ... (not yet
verified)`**; the squash-merge hides it, but do not be surprised by it in a branch's log.
- **Builders must rebase onto `origin/main` and run `prettier --check` on `docs/specs`** before opening a PR;
  unformatted agent-written specs failed CI's format check once.
- **The Stop hook checks the orchestrator's current directory.** `cd`-ing into a builder's worktree makes that
  worktree the checked directory, and a worktree that is mid-rebase must not be committed into.
- **A `pr-title.yml` run can show a `cancelled` twin beside a success** after a description edit; the dedupe
  handles it. The Version Packages PR appears 1-2 minutes after a merge. A relayed `check_suite` event can
  name an older head: always read the check runs for the current head.
- **`pnpm measure:toolbar -- <name>` ignores the filter** and runs every measure spec, rewriting
  `docs/specs/toolbar-redesign/photos`. Run one spec with
  `pnpm exec playwright test --config playwright.measure-toolbar.config.ts <spec>`; `M0_TAG=after` on
  `toolbar-grid-m0.spec.ts` writes only `docs/specs/toolbar-grid/photos/after-*`.
- **A worktree without `node_modules` cannot run the husky hook** (lint-staged not found). Either run
  `pnpm install --frozen-lockfile --prefer-offline` in it, or format and lint the commit message from the
  main checkout (`pnpm exec prettier --write`, `pnpm exec commitlint --edit`) before committing.
- **`changeset-release/main` is updated 1–10 minutes after a merge**; poll it with `git ls-remote` rather
  than listing workflow runs. The tag (`web-vX.Y.Z`) lands about a minute after the Version Packages merge.

- **Batch-2 lessons (2026-10-14):**
  - **A reviewer pass before the database run saves a round.** Every milestone's first design had a
    blocking finding (#978's Highlight-filled selected row failed three reviewers at once); folding
    reviews while another builder held the database kept the queue moving.
  - **Merging one web PR conflicts the next** on `CLAUDE.md`'s web file count and `docs/TECH_DEBT.md`'s
    open sections. Resolve the register by deleting both closed rows' open sections (both ledger lines
    already exist) and let `pnpm check:counts` name the right banner number.
  - **Hold the Version Packages PR open to batch** several web patches into one release; re-read its
    `get_files` after the last merge and pin the merge to its head SHA.
  - **`get_check_runs` answers for the PR's current head**; confirm the head with `pull_request_read get`
    when a push and a check start are seconds apart.
  - **A builder's notification can arrive without its report**; read the branch with `git ls-remote` and
    `git log` rather than waiting.
  - **`cd`-ing into a builder's worktree** moves the Stop hook's checked directory; `cd` back at once.
  - **Long `vitest run` and `turbo run test` exceed the 10-minute foreground limit**; run them in the
    background.

- **1.0-requirements lessons (2026-10-14):**
  - **Never wait with `while pgrep -f "<name>"`** inside a shell whose own command line contains
    `<name>`: it matches itself and loops for ever. This session lost half an hour to one, and a
    builder left two (`until ! pgrep -f "vitest run"`). Wait on a PID or a lock file instead.
  - **Builders worked in worktrees on local branches and never pushed**; the orchestrator
    cherry-picked their range onto the designated branch, ran `pnpm prepush` plus the e2e suites,
    and pushed. Brief each builder with the exact base SHA.
  - **`e2e-overview` "the landing shows what changed…" takes ~31 s in this container** against the
    30 s default and fails on timeout only (no assertion); CI runs the whole overview suite in about
    1.3 minutes. Treat a local timeout there as the sandbox, and confirm on CI shard 4.
  - **CI's `image` job keeps backups in `/tmp/schedulepoint-backups`** (`BACKUP_DIR`), because the
    build context cannot descend into a uid-1000 mode-700 `./backups`. A step that recreates the
    `api` container loses its first-boot log, so the job saves it first.
  - **A second restore in the same minute** once collided on the kept database's name; the script now
    picks a free name (#993). Keep that regression case in `scripts/backup-restore-check.sh`.
