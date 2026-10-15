# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-15. A short session after the three 1.0 requirements. It verified the previous
hand-off against `main`, ran the reconciliation pass, and landed two small test additions. **Nothing was
released** (no changeset in either PR), and **1.0 is not cut**; that stays the owner's call (ADR-0190).

## Where things stand

- **Latest releases are unchanged:** `api` 0.94.0 and `web` 0.192.0 (tags confirmed with
  `git ls-remote --tags`).
- **This session's PRs:**
  - **#1003** `docs(docs): reconciliation pass after the 1.0 requirements`. The pass taught six reviewer
    agents about ADR-0192 to ADR-0194 (none had heard of them) and corrected `docs/ARCHITECTURE.md`
    (hosting "still open"; it was settled 2026-08-01), `README.md` (the Gantt start-edge resize
    "absent"; it shipped in web 0.157.0) and several indexes. It also fixed `docs/RELEASE_1_0.md`: the
    short answer had called backups and the export "missing", the "today" versions and rollback tags
    were old, and row 5's practice-check time now matches the guide (10 to 15 minutes, plus about 15
    to read Parts 3 and 4). Recorded in `docs/DECISIONS.md` and `docs/RECONCILE.md` (last full pass
    2026-10-15).
  - **#1004** `test(web): assert the 1024 x 600 rail fit and close the #978 forced-colour nits`. A committed journey `apps/web/e2e-audit/rail-1024.spec.ts` asserts
    that at 1024 × 600 the expanded rail keeps all seven organisation links, the tree's 128 px floor
    (measured 251 px fine, 131 px coarse) and the version footer, for fine and coarse pointers. It
    also closes the three deferred #978 nits in `apps/web/e2e-gantt/forced-colors.spec.ts`: the
    summary band's 1 px inset, a finished task against a summary under forced colours (the seed gained
    "Echo finished task"), and a why-comment on `colourBehind`. The optional selected-row hairline was
    not built.
- **Not done from the pass, by choice** (recorded in the 2026-10-15 `DECISIONS.md` entry): the
  specialist reviewer sweep over recent diffs (the export and backup PRs already had review passes in
  their own session), a full register walk (sampled 15 rows), and step 5a. Proposed and not acted on:
  cite code by symbol rather than line number in ungated prose (four documents had stale line
  citations); a `mkdir backups` hint in `README.md`'s container quick-start.

## What the owner has to do (in this order)

Unchanged from the last hand-off. **The owner said on 2026-10-15 they will do these another day.** When
they report a result, record it in `docs/RELEASE_1_0.md` (rows 5, 6, 7) and `docs/DECISIONS.md`, and if a
guide is wrong or unclear on the real server, fix the guide.

1. **Backups — host steps and one practice check** (row 5). Guide:
   [`docs/guides/back-up-and-restore.md`](guides/back-up-and-restore.md). About 25 minutes of set-up, a
   10-minute wait for the first copy, 10 to 15 minutes for the `check`, and about 15 minutes to read
   Parts 3 and 4 once: **about an hour**. Done when the owner reports one `CHECK PASSED` with its date
   and the copy's file name. The guide's paste block was compared with `docker-compose.release.yml` on
   2026-10-15 and matches (only comments differ).
2. **Export — download once** (row 6). Guide:
   [`docs/guides/export-your-organisation.md`](guides/export-your-organisation.md), about 10 minutes.
3. **Clear-out — switch on, only on a day step 1 has passed** (row 7). Guide:
   [`docs/guides/switch-on-the-clear-out.md`](guides/switch-on-the-clear-out.md). Irreversible; the owner
   alone switches `RETENTION_HIERARCHY_ENABLED` on. Run the preview first.

Walk the owner through them **one at a time, in plain English**, waiting for each result.

## Decided — do not re-ask

- Do not cut 1.0 until the owner says.
- The clear-out is switched on only by the owner, on a day a backup `check` has passed.
- Export size: accept the current design; do nothing about the 100-plan estimate unless the owner raises
  it (`docs/specs/organisation-export/m2-measurements.md`, #515, #516).
- Collaborative editing is not in 1.0.
- Four web e2e shards; the fifth-shard trigger is the slowest shard above 1,250 s (median of three runs)
  or a 30-minute timeout.
- The diagram keeps its own colours under a Windows contrast theme (#508).
- `Start editing` stays plain while the pen is not held.

## Parked by the owner — keep, do not raise

The owner parked these (`docs/DECISIONS.md`, 2026-10-13; reaffirmed 2026-10-15). A session does not bring
them up until the owner does. When the owner returns to one, the steps are ready:

- **Set up the alerts** with `docs/guides/set-up-alerts.md` (~15 minutes on the host; do the test part at
  a quiet time). When a test alert reaches the owner's phone, close #100.
- **Run the device check sheet** (`docs/specs/pre-1-0-hardening/device-check-sheet.md`, ~1½–2 hours in two
  sittings). The owner replies with one line per step; record the answers in a `device-check-results.md`
  beside the sheet and turn each "wrong" into a row or a fix.
- Older parked items, unchanged: the toolbar "minor tweaks" (#499 — ask which before building any),
  SC-16 photos, 72 rem confirmation, Surface sheet steps 25, 18b, 25b, 26–28, the history count on or
  after 1 November, Gantt hands-on readings, header at 320/640.
- The 1.0 checklist lists both parked jobs as "the owner's call" with no position; keep it that way.

## Open rows worth knowing

- #509–#514 (backup follow-ups), #515–#517 (export follow-ups), #507 (no exported OpenAPI file; owner's
  call, default not for 1.0), #508 (by decision).
- The #978 deferred nits are **closed** by #1004, and the rail's seven-link fit is now a committed
  assertion (an eighth link will fail it on a coarse pointer).
- **Not folded, by choice:** a leave-page guard during an export (the page says leaving cancels it).

## Suggested next

Nothing is in flight: no open PRs, no wake-ups armed. Ask the owner what to take next, offering:

1. **The owner's three host steps** above, when they are ready, recorded as they come.
2. **Row 9 at the cut** (remove the four deprecated revision-comparison fields) when the owner chooses
   to cut 1.0.
3. A small docs PR for the two proposals the pass left (symbol citations; `mkdir backups` in the README
   quick-start), only if the owner wants it.

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

- **2026-10-15 lessons:**
  - **The main checkout has no `node_modules`.** Run `pnpm prepush` and the e2e suites in a builder's
    worktree, moved onto the exact head you will push (`git checkout --detach <sha>`), then `cd` back.
  - **A builder's run script wrote `/api.pid` and `/vite.pid` at the filesystem root**, and the safety
    check refuses any `rm` at `/`. They are harmless; brief builders to write pid files inside their
    worktree or the scratchpad.
  - **The Stop hook counts commits against the branch's old remote tip** after a squash-merge and a
    reset, so it asks for a push while `pnpm prepush` is still running. Wait for the gate; push with
    `--force-with-lease=<branch>:<old-sha>`.
  - **A scheduled wake-up whose notes go stale can be corrected in place** with `update_trigger` (new
    prompt), which avoids a second live trigger.
