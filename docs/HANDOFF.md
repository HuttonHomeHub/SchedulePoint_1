# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-21 (evening). The owner chose seven register rows and said "fix 1 to 7 in this
session". All seven are done, in six PRs, plus a small test fix found on the way: **#313** narrowed,
**#354 + #280** (two of the repository's own checks), **#165** (Delete for notes and baselines behind
the row's ⋯), **#72** (the shared checkbox), **#537** (the reset link's token moves into the link's
`#` part) and **#116 item 3** (a greyed-out control now shows its reason to everyone, ADR-0204).
Released as **`api` 0.98.0** and **`web` 0.196.0**. The owner's **hard rule** still stands: nothing that
needs them to test, measure or check anything on their server or devices (a decision question is
fine; a test is not). **1.0 is not cut**; that stays the owner's call (ADR-0190).

## The owner's 2026-10-21 answers (in `docs/DECISIONS.md`)

- **Choice:** fix #313, #354, #280, #116 item 3, #537, #72 and #165 this session.
- **Five specs approved with every default** (`docs/specs/gate-invocation-repairs/`,
  `shaded-reason-visible/`, `reset-link-fragment/`, `checkbox-field-adoption/`, `screen-tidy-165/`):
  CLAUDE.md §19.8 names `pnpm prepush:push`; a shaded menu item prints its reason inline (not a
  tooltip); the five labelled toolbar controls get a reason tip too; an expired reset link is reported
  when the form is submitted, not on arrival; Delete for notes and baselines moves behind ⋯ (two
  presses, the same rule as clients, projects, plans and resources).

## Where things stand

- **Latest releases:** `api` 0.98.0 and `web` 0.196.0.
- **This session's PRs, in merge order:**
  - **#1091** #313 narrowed to the one unexplained Firefox-only sign-up failure. Its headline was stale:
    71 of 73 sign-up waits already carry the 15 s timeout (the other two are not waits).
  - **#1092** #354 + #280. `check:flags` strips comments before reading Playwright pins and refuses,
    loudly, the shapes the stripper cannot read safely (a `/*` after a quote or after `//`).
    `pnpm prepush:push [git push args]` runs the whole gate and pushes only if nothing failed; it refuses
    a dirty tree, a failing `git push --dry-run`, a HEAD or branch that moved during the gate, and
    `--checks`. devops-reviewer found a real hole (a `/*` inside a `//` comment hid a pin); fixed first.
  - **#1093** #165 closed: (b) and (e) were already fixed (the row had not recorded it); (d) Delete for
    notes and baselines moved behind the row's ⋯. Its new baseline-delete journey failed CI once (it
    captured a baseline before recalculating); fixed by mirroring the variance journey's set-up.
  - **#1095** #72 closed: three hand-rolled checkboxes (not five) now use `CheckboxField`, which gained
    `labelHidden` and `targetData`.
  - **#1096** #537 closed: the reset email links to `{web}/reset-password#token=…`; the library's
    `GET /api/auth/reset-password/:token` is shadowed with a 303 to that form and **no token lookup**
    (security-reviewer: APPROVE; it removes a validity oracle the old GET had).
  - **#1097** #116 closed (item 3 was its last item): ADR-0204. Menus print a shaded item's reason
    inline; `Tooltip` gained `purpose: 'reason-echo'` (visual only, also opens on press) for five
    toolbar controls. The accessibility review found a real defect before ship (a reason tip could
    reappear on a control already left); fixed with a red-first test. New row **#538** (a read-only
    Gantt cell's reason is still only a `title`; a decision, not a build).
  - **#1098** a test fix to #1092's own test: its fixture checks were written `node -e process.exit(1)`
    with bare brackets, which some shells refuse.
  - **#1094** the Version Packages release.

## The three host steps: DONE on 2026-10-20

Later on 2026-10-20 the owner asked to do them and was guided through them in the same chat (full record
in `docs/DECISIONS.md`, 2026-10-20). `docs/RELEASE_1_0.md` rows 5, 6 and 7 are **Done**.

- **Backups:** on. Folder `/apps/schedulepoint/backups` on the owner's server (stacks live in `/apps`,
  not `/opt/stacks`; the terminal is Dockge's own, signed in as root, so no `sudo`). `CHECK PASSED` on
  `schedulepoint-2026-10-20T1601Z.dump` and on `schedulepoint-2026-10-20T1632Z.dump`. `.env` saved.
- **Export:** `schedulepoint-export-wood-group-20261020T1615Z.zip`, opened and correct.
- **Clear-out:** **ON** (`RETENTION_HIERARCHY_ENABLED=true`). The compose file needed the pass-through
  line added first. The first run removed 9 Wood Group test clients deleted 2026-07-21; `…T1632Z` is
  the copy taken just before. More test clients from late July and August expire over the next weeks,
  as the owner saw on the preview and in Recently deleted.
- The guides were corrected where they did not match the server. New row **#536** (the Audit log names
  the clear-out "Unknown"; the bin and the preview round days left differently).
- **For the alerts step, when the owner returns to it:** their compose file already sets
  `MAIL_ALERT_URL` (an ntfy topic) and `HEARTBEAT_URL`, but the heartbeat URL reads
  `https://hc-ping.com/my-first-check`, which looks like an unfinished placeholder. Check it then; do not
  raise it before.

## Decided — do not re-ask

- **Hard rule (2026-10-18, restated 2026-10-19 and 2026-10-20):** offer nothing that needs the owner to
  test, measure or check anything on their server or devices. Decision questions are fine.
- Do not cut 1.0 until the owner says.
- The clear-out is switched on only by the owner, on a day a backup `check` has passed.
- Export size: accept the current design; do nothing about the 100-plan estimate unless the owner raises
  it (`docs/specs/organisation-export/m2-measurements.md`, #515, #516).
- Collaborative editing is not in 1.0.
- Four web e2e shards; the fifth-shard trigger is the slowest shard above 1,250 s (median of three runs)
  or a 30-minute timeout. No fifth shard.
- The diagram keeps its own colours under a Windows contrast theme (#508).
- `Start editing` stays plain while the pen is not held.
- The default database password is warned about, not refused (2026-10-16).
- Metric tiles: the shared look everywhere, no boxed option (2026-10-16).
- The combobox's disabled-option behaviour ships before any screen uses it (2026-10-16).
- Redundant links: zero or negative direct lag still counts (W5 loosened, 2026-10-17).
- The export's float columns are named `…Days`, format 2.0 (2026-10-17).
- 2026-10-18 batch answers (all in `docs/DECISIONS.md`): #242 remove the prefill; #116 quick taps are one
  undo; #403 show both cues; #223 included when showing, every layer; #519 refuse with defaults and bring
  the project calendar back; #368 Route A; #234 defer the text-only states, load early, cautious contract,
  and the four SC amendments; #382 gate ~150 activities; #58 the tint follows the switch; #271 paging
  not now.
- 2026-10-19 answers: #522 near-critical is ≤ 5 working days of the activity's own calendar; #523 amber
  inside sRGB; #533 the health panel keeps its spinner; #534 Members loading/error states; #76 flag-off
  journey (Option A); #69 keep both row-edit idioms; #64 Viewer summary / shaded editors for a pen-less
  Planner; the WCAG 2.5.3 header fix is "both fixes"; password reset stays sequential.
- 2026-10-20: #535 as its spec; #307(a) skip-the-placeholder default; #88 no sign-in on Confirm;
  a `**Verified:**` date dates the whole row (A8a/A8b).
- 2026-10-21: the five specs with every default (see the answers above).

## Parked by the owner — keep, do not raise

The owner parked these (`docs/DECISIONS.md`, 2026-10-13; reaffirmed 2026-10-15, 2026-10-16, 2026-10-17,
2026-10-18, 2026-10-19, 2026-10-20 and 2026-10-21). A session does not bring them up until the owner does. When the
owner returns to one, the steps are ready:

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

- **#538** (new): a read-only Gantt cell's reason is still a native `title` (hover-only). Deliberately
  left out of ADR-0204: a tip on every cell the arrow keys pass would be noise. Needs a decision.
- **#313** is now only the one Firefox-only failure of 2026-09-13; its trigger is "read that run's
  trace first, the next time a base-journey sign-up wait fails on CI".
- **#532** is only the Members table's placeholder rows being 4–8 px shorter than settled rows (needs
  a `Column` prop, a component contract: ADR-0105 spec trigger). Accepted known gap.
- **#271** stays open for cursor paging (owner: not now).
- #507 (no exported OpenAPI file; owner's call), #508 (by decision), #321 (deferred on a trigger),
  #391 and #395 (remaining painter items), #509, #510, #512, #513 and #515–#517 (deferred on triggers;
  #509 is the off-site copy: today's copies live on the same disk as the database).
- **#326** is three items (a)–(c).
- **Decided 2026-10-19 — leave it:** better-auth 1.7.10 makes a reset atomic only when the adapter runs
  transactions; ours runs the steps in order (fail-closed; a crash mid-reset spends the link).

## Suggested next

Nothing of this session's is in flight: no open PRs, no wake-ups armed. Start none until the owner
picks. **None of these has been checked against the code yet**: check each row's symptom first (two
of this session's seven had already been fixed in part).

1. **#538** — a decision: should a read-only Gantt cell show its reason when pressed? Small either way.
2. **#326** (a)–(c) — the three staff-console gate findings.
3. **#276** — a failing gate's log is tailed to 12 lines; now that `prepush:push` exists, check whether
   it still bites.

Runners-up: #249 (four hand-copied dock-geometry blocks), #299 (nothing asserts that a command CI
runs is also run by `pnpm prepush`; ADR-0160 may already cover it), #306, #308. The next
reconciliation pass when `check:reconcile-due` warns on a full clone (last pass 2026-10-19; in this
shallow clone it warns only because it cannot date ADRs).

Still offer only if the owner raises it: row 9 at the 1.0 cut.

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
  re-arm only on a firing. A fired notification can be delivered minutes late, so an empty
  `list_triggers` can mean one fired and is still on its way (2026-10-19); arm one if it is empty and
  work is in flight. **`delete_trigger` the last one when the chain ends.**
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
- **A test in `apps/web/e2e-workspace-chrome/plan-switch.spec.ts` flaked** under load; the `newPlan` helper had a race (it skipped the project
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

- **2026-10-16 lessons:**
  - **A worktree agent that finishes with no changes has its worktree removed.** Resuming it with
    `SendMessage` lands it in an empty folder (every tracked file shows as deleted). Start a fresh
    builder instead of asking it to restore the tree; nothing was lost.
  - **Two background runs writing one log file interleave.** Give every gate run its own log name
    (`prepush-<row>.log`), or a finished first run's tail is read as the second run's result.
  - **A stalled `playwright install --with-deps` can time a shard out** (12 m 43 s on 2026-10-16 against
    ~2 minutes). Read the job log before treating a 30-minute cancel as suite time; one re-run is
    allowed because no test body was slow.
  - **Two API fixes touching `OperationalModule` and `PrismaService`** were each tested on their own
    base; the second was re-run (full API e2e, unit, prepush) on top of the first before it was pushed.
    Do that whenever two parallel branches touch the same module.
  - **`docs/TECH_DEBT.md`'s closed ledger conflicts on every second closing PR**; keep both rows.
  - **A test that overrides `PrismaService` with a bare `PrismaClient`** (`activity-history-statements`)
    breaks when `PrismaService` grows a method a constructor calls; give the stub the method.

- **2026-10-16/17 lessons:**
  - **Merge one PR at a time and rebase the next onto `main` just before.** Every PR that closes a row
    touches `docs/TECH_DEBT.md`'s closed ledger, so every second merge conflicted. Rebasing in parallel
    only multiplied the work.
  - **In a rebase, "ours" is `main` and "theirs" is the commit being replayed.** A helper that let "theirs"
    win on a duplicate ledger row silently put back `main`'s older wording of #303. Check every duplicate
    row by hand, drop hunks where both sides deleted rows, and confirm `git diff origin/main --
docs/TECH_DEBT.md` shows only that PR's rows.
  - **After rebasing onto a dependency bump, run `pnpm install --frozen-lockfile --prefer-offline` (and
    `prisma generate`) in the worktree before `pnpm prepush`.** Without it `check:claims` fails ("verified
    against 12.1.3, 11.2.7 is installed") on code that is fine.
  - **Tell read-only reviewers never to check out a branch in the main checkout** (`git show` and
    `git diff` only). One left `/home/user/SchedulePoint_1` detached on a feature commit, which deleted an
    untracked working copy other builders were reading.
  - **A red-first Playwright probe is cheap and decisive for focus bugs.** The #481 probes showed one copy
    was fine in Chromium and the other really dropped focus. Reading the code alone had guessed the
    opposite risk for the strip. For TanStack Query refetches in a probe, dispatch `visibilitychange` on
    `window` and wait past the 30 s stale time.
  - **The container restarted once mid-session** (about 01:00); worktrees, pushed branches and the
    wake-up survived, and nothing was lost.

- **2026-10-17 lessons:**
  - **API e2e reads `@repo/types` and `@repo/interchange` from their built `dist`.** After checking out a
    commit that changes a package, run `pnpm --filter "./packages/*" build` first, or a journey fails on
    a stale type (it cost one false red on redundant-link M2).
  - **Turbo stops `api` and `web` tests after the known interchange failure.** `pnpm prepush` then reads
    "11 cached, 14 total"; re-run `npx turbo run test --continue` to see the rest actually pass.
  - **A review fold that rewords copy must re-run the journeys that read it.** #1035's fold reworded the
    retention sentence and left `e2e-recently-deleted` asserting the old one; it was caught by running the
    suite on the exact head before merge, not by CI. Grep `apps/web/e2e*/` for the old string.
  - **The replay helpers** (`resolve.py`, `replay.sh` in the session scratchpad) take ours for count
    banners, union ADR lines keeping the **longer** line (an amendment), and keep both ledger rows. They
    must **not** touch `docs/BACKLOG.md`/`ROADMAP.md` (it duplicated an entry) — resolve those by hand.
    A cherry-pick paused on an empty commit is not "done"; check for `CHERRY_PICK_HEAD`.
  - **Stack the whole batch in one worktree, validate it once, then cherry-pick slice by slice onto
    `main`** after each squash. When `git diff <tested-sha> HEAD` is empty, the gate result carries over.
  - **This machine (15 GB, 4 cores) cannot run two `pnpm prepush` at once** — they OOM or time out — and
    some unit files flake under load (ActivityEditor progress drafts, promotion anchors/manifest, the
    Gantt "Stop editing" step). Re-run a failing file alone before believing it.
  - **A menu-probe click must hit the part of the button the open menu does not cover**, and the toolbar
    suite runs with `VITE_CANVAS_AUTHORING=false` — put an authoring probe in `e2e-authoring`. Confirm
    every probe red on the old code.
  - **A test server started under `setsid` saves setsid's PID, not the server's.** Find it by its
    `API_PORT` in `/proc/*/environ` and kill its process group.

- **2026-10-18 lessons:**
  - **Check a gate's exit status directly, never through a pipe.** `node scripts/check-counts.mjs | tail -2 && …`
    reports `tail`'s success, so a failing count looked green once; the next slice caught it.
  - **`e2e-audit/org-export.spec.ts`'s axe scans now wait for animations to end** (`scanWhenSettled`): the
    Download button changes variant and sits under the pointer, so an immediate scan read half-way colours
    (4.17:1, 2.22:1) and failed 3/3 on a docs-only PR. Settled colours pass (15.3:1 / 17.4:1). If that scan
    flakes again, look past the transition. A repeated local run of it trips the export endpoint's
    100-per-60 s rate limit; space runs a minute apart.
  - **A restack must include every commit the feature branch grew since the stack was built**, not only the
    newest ones; a builder found two missing predecessors (modify/delete conflict on a test file) and picked
    them first.
  - **The main checkout shares the designated branch with the `pr` worktree.** After `checkout -B` in the
    worktree, the main checkout's files lag its ref and the Stop hook reports hundreds of staged changes.
    Confirm the index matches an older `main` (`git write-tree` against `rev-parse <sha>^{tree}`), then
    `git reset --hard HEAD` there; nothing is lost.
  - **A PR title must stay at or under ~92 characters** before GitHub's ` (#NNNN)` suffix; #1052 failed at 94.
  - **The Version Packages branch is rebuilt about a minute after each merge**; wait for its SHA to change
    (`git ls-remote origin refs/heads/changeset-release/main`) before merging it, then pin that SHA.

- **2026-10-19 lessons (the Dependabot batch):**
  - **Regenerate a rebased bump's lockfile with lowest-direct resolution.** Taking `main`'s lockfile and
    running a plain `pnpm install --no-frozen-lockfile` resolved nodemailer `^10.1.1` to **10.1.7**, a
    version nobody had reviewed. `pnpm install --no-frozen-lockfile --config.resolution-mode=lowest-direct`
    lands each bump on exactly the version its PR names; then confirm with `--frozen-lockfile` and that
    a second plain install changes nothing. Read the whole `git diff origin/main -- pnpm-lock.yaml`
    package list, never a `tail` of it.
  - **Dependabot's own rebase rewrites more than its package** (it drifted half a dozen unrelated
    transitive packages on #1056) **and can retitle the PR past the length limit.** Prefer the pnpm
    regeneration and re-check the title after every Dependabot rebase.
  - **Stale `node_modules/.pnpm` copies trip `check:claims`** ("more than one copy in the store") after
    a worktree changes branch. Delete every `node_modules` and reinstall frozen before believing it.
  - **`scripts/dependency-claims.json` conflicts on every rebase** in the `verifiedAgainst` block. Both
    sides are pins; keep the higher version of each package. Never take one side wholesale.
  - **A new axe-core minor can enable a rule by default.** Four scans run without `withTags` and so
    run every enabled rule; that is where 4.14's `label-content-name-mismatch` surfaced. axe counts
    `aria-hidden` text as visible for that rule (`visibleVirtual(..., false)`).
  - **Keep squash titles at or under ~92 characters before ` (#NNNN)`** — the commitlint limit applies
    to the subject that lands on `main`, and the merge tool does not check it.
  - **Pushing to a Dependabot branch is fine** (it stops Dependabot rebasing that PR); use
    `--force-with-lease=<ref>:<sha just read with ls-remote>`.
  - **Run the long local e2e while CI runs**, and merge only when both are green — it saved a full
    cycle per PR.

- **2026-10-19 lessons (evening: the reconciliation pass and the follow-up rows):**
  - **The container restarted twice in about half an hour** (22:35 and 23:02). Background shell runs
    die with it; pushed branches, local branches, the scratchpad and scheduled wake-ups survive.
    Postgres does not come back on its own: `scripts/e2e-local.sh --db-only` restarts it. Re-run any
    log that ends without its `EXIT` line.
  - **`list_triggers` can be empty while a fired wake-up's notification is still on its way** (one
    arrived three minutes after it fired). When it is empty and work is in flight, arm one anyway
    (CLAUDE.md §19.12); if the late one then arrives, do not arm a second.
  - **Union-merging `docs/TECH_DEBT.md` in a rebase is unsafe**: it brought closed rows' sections back
    (A5 findings) and once doubled the whole ledger (685 rows). What worked: keep `main`'s file through
    every conflicted step (`git checkout --ours`), then re-apply the branch's own closures (delete its
    `### N.` sections, add its ledger rows) from a saved copy of the branch's file, and check that
    `git diff origin/main -- docs/TECH_DEBT.md` is only those rows.
  - **A union merge of `CLAUDE.md` duplicates the banner lines**; keep one and let `pnpm check:counts`
    name the numbers.
  - **A guard that closes a hole can break a journey that used the hole as setup.** #530's narrowing
    refusal broke `apps/web/e2e/recently-deleted.spec.ts` on CI shard 2 (a deterministic 409 in all
    three browsers). Grep `apps/web/e2e*/` for the request a new refusal blocks, not only for the UI.
  - **`apps/web/e2e-netpoint-grammar/support.ts` seeds through `http://localhost:3000`** (hard-coded).
    Run that suite with the API on port 3000, or its seeding tests fail with `fetch failed`.
  - **A reusable isolated-stack runner** lived at `scratchpad/suite.sh` this session (random ports,
    own database, kills only its own process groups). Rebuild it from the "Isolated stack" note above
    if needed; give each suite's `VITE_` flags from its config.
  - **The org-export journey is `apps/web/e2e-audit/org-export.spec.ts`** (there is no
    `e2e-org-export` folder). Its axe scans now switch transitions off before scanning (#1070).

- **2026-10-20 lessons (#535):**
  - **A fresh worktree needs `pnpm turbo run build` for the packages before vitest**: the builder
    found `@repo/types` had no `dist` even after `pnpm --dir <worktree> --filter "./packages/*" build`
    had exited 0 from the main checkout (why was not established). Run the build from inside the
    worktree and check for `packages/types/dist`.
  - **`react-hooks/set-state-in-effect` refuses clearing state in an effect.** Reset state that
    follows a prop during render (`if (!canManageLogic && editingId !== null) setEditingId(null)`)
    and keep only the announcement in the effect.
  - **jsdom's `<dialog>` does not return focus on `close()`.** A focus-return claim (AC4) needs a
    Playwright step; the unit test can only show the dialog closed and the opener survived.
  - **Releasing the pen server-side from a journey** (`fetch DELETE …/edit-lock` in
    `page.evaluate`, then wait ≤ 25 s for the 15 s status poll) is the reusable way to test "the pen
    is taken under you" while a modal covers the toolbar (#64's and #535's journeys).
  - **After a squash-merge and `checkout -B` onto `main`, the Stop hook reports an unpushed
    commit**; push with `--force-with-lease=<branch>:<old remote sha>` to sync the branch.

- **2026-10-20 lessons (#307(a), #263(i)):**
  - **Another chat may edit this file at the same time.** The owner's device/host chat had a PR open
    (#1085) rewriting the host-steps sections here while this session wrote its hand-off. Change
    only your own sections, so the two diffs touch different lines and merge cleanly.
  - **After a merge, the Version Packages PR's `get` can show the old head for a minute** even once
    `git ls-remote` shows the rebuilt `changeset-release/main`. A merge pinned to the new SHA then
    fails `409 Head branch was modified`; re-read `get` until its `head.sha` matches, read
    `get_files` again, then merge.
  - **A stale local `origin/<branch>` ref breaks `--force-with-lease`** when the remote branch no
    longer exists (`stale info`). Check `git ls-remote` first; delete the tracking ref
    (`git update-ref -d refs/remotes/origin/<branch>`) and push plainly.
  - **Check a row's symptom in the code before fixing it.** #263(i)'s literal symptom had already
    gone; the fix that remained was smaller and different.

- **2026-10-20 lessons (#88 and the gate repairs):**
  - **`check:debt-status` now refuses an undated row.** Every row whose status is not `unverified`
    needs `**Verified:** <date>` inline in its header line (after `·`, or opening a wrapped header
    line). A new row without one fails A8b; an `unverified` row with one fails A8a.
  - **`check:claims` now fails on a registered claim nothing cites.** When a change removes the
    last citation of a `scripts/dependency-claims.json` entry, delete the entry in the same change.
  - **A literal file name followed by a colon and a line range (in a doc, a comment or a fixture) reads as a citation** to
    `check:claims`; build such strings with `join` in tests.
  - **Stack the next PR on the one under review in its own worktree** (`git checkout -b x <head>`,
    cherry-pick, run `pnpm prepush`). After the squash, the merged tree equals the tested head, so
    the stacked tree carries over unchanged; only `docs/DECISIONS.md`'s top entry conflicted.
  - **A page reached by a hash-only navigation does not remount** (`/verify-email` then
    `/verify-email#token=…`); listen for `hashchange` when the hash carries the input.

- **2026-10-21 lessons (the seven-row batch):**
  - **Never run a gate as `pnpm -s <gate>` in this container.** Inside a `pnpm` script, the nested
    `pnpm` (`/root/.local/share/pnpm/.tools/pnpm/10.4.1`) turns a script's exit 2 into 1 when output is
    silenced, so an advisory WARN reads as a FAIL (`check:doc-register`'s `prepush:push` test failed that
    way). Plain `pnpm <gate>`, as CI and `pnpm prepush` run it, is fine. Brief builders the same way.
  - **Never type a command you have not read back.** A stray `ln -sf . /dev/null` replaced `/dev/null`
    with a link to `/dev`; every `>/dev/null` then failed with "Is a directory" and two e2e suites died
    before starting. The safety check (rightly) refused deleting it; a container restart restored it.
    Re-run any suite whose log shows "Is a directory".
  - **`scripts/e2e-local.sh` always uses ports 3000 and 5173**, so only one suite can run at a time.
    Builders wrote code and ran unit tests and gates in parallel worktrees; the orchestrator ran every
    e2e suite serially (queued with `until grep -q ALLDONE <previous log>`), and handed the database to
    one builder at a time when a builder had to iterate on a journey.
  - **A journey split out of a long one must copy its set-up.** The new baseline-delete test captured a
    baseline before recalculating; it passed locally once and failed CI 3/3 in Chromium.
  - **A row's own "five call sites" or "still open" can be wrong.** #72 had three; #165 (b) and (e)
    were already done. The feature-analyst caught both by reading the code before writing the spec.
  - **Resolving `docs/TECH_DEBT.md` in a rebase:** take the other side's file, re-apply only the
    replayed commit's own change with `git diff <commit>^ <commit> -- docs/TECH_DEBT.md | git apply -3`,
    then settle the ledger conflict by keeping every row (and the newer wording of a row both sides
    edited). `docs/DECISIONS.md`: keep both top entries, newest first.
