# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-14. The session planned, built and shipped **pre-1.0 batch 2**
(`docs/specs/pre-1-0-batch-2/`, approved by the owner 2026-10-13, all six milestones). Every PR was
squash-merged with all ten checks green on the pinned head.

## Where things stand

- **Releases this session:** `api` 0.89.4 (#977) and `web` 0.190.2 (#979, carrying #978, #980, #981).
  Tags `api-v0.89.4` and `web-v0.190.2` confirmed.
- **Batch 2, by milestone:**

  | M   | What                                                              | PR(s) | Release     |
  | --- | ----------------------------------------------------------------- | ----- | ----------- |
  | 0   | Spec and plan, approved, with the owner's answers                 | #974  | —           |
  | 1   | What 1.0 means: `docs/RELEASE_1_0.md`, ADR-0190, row #507         | #975  | —           |
  | 2   | Contrast themes: shaded controls and Gantt marks (#505, ADR-0191) | #978  | web 0.190.2 |
  | 3   | Summary redo locks its subtree in id order (#500)                 | #976  | api 0.89.4  |
  | 4   | Toolbar runs keyed by identity, so focus survives a resize (#504) | #980  | web 0.190.2 |
  | 5   | Gantt month labels thinned by measured width at 200 % text (#501) | #981  | web 0.190.2 |
  | 6   | Make-milestone journey from ~190 s to ~30 s (#506)                | #982  | —           |

- **What changed for planners:**
  - under a Windows contrast theme, greyed-out menu items and buttons look greyed out, and the Gantt's
    bars, milestones, progress and selected row (a coloured left edge) stay visible; the diagram keeps
    its own colours by decision (#508);
  - undoing or redoing the deletion of a summary no longer risks a server error while a drag saves;
  - resizing the window no longer drops focus from a toolbar button or wrongly announces it gone;
  - at 200 % text the Gantt's month names no longer overprint, and at least one is always shown.
- **What 1.0 means** is now written down in `docs/RELEASE_1_0.md` (ADR-0190). Its short answer is
  "not yet": the owner made three things **required** before 1.0 (2026-10-13, `docs/DECISIONS.md`):
  a tested database backup and restore, a whole-organisation export, and the recycle bin's 90-day
  clear-out working (built, off on the host). Each needs its own spec. The owner said **do not cut 1.0
  yet**; the cut is a separate step after the checklist is done.

## Parked by the owner (2026-10-13) — keep, do not raise

The owner parked these (`docs/DECISIONS.md`, 2026-10-13). They are not work for a session, and a session
does not bring them up again until the owner does. When the owner returns to one, the steps are ready:

- **Set up the alerts** with `docs/guides/set-up-alerts.md` (~15 minutes on the host; do the test part at
  a quiet time). When a test alert reaches the owner's phone, close #100.
- **Run the device check sheet** (`docs/specs/pre-1-0-hardening/device-check-sheet.md`, ~1½–2 hours in two
  sittings). The owner replies with one line per step; record the answers in a `device-check-results.md`
  beside the sheet and turn each "wrong" into a row or a fix. Steps 22–23 (contrast theme) were reworded
  this session into plain yes/no lines and now confirm the #505 fix rather than the fault.
- Older parked items, unchanged: the toolbar "minor tweaks" (#499 — ask which before building), SC-16
  photos, 72 rem confirmation, Surface sheet steps 25, 18b, 25b, 26–28, the history count on or after
  1 November, Gantt hands-on readings, header at 320/640.
- **Decided, do not reopen:** collaborative editing is not in 1.0; four web shards (fifth-shard trigger:
  slowest shard above 1,250 s, median of three runs, or a 30-minute timeout); `Start editing` stays plain
  while the pen is not held; the diagram keeps its own colours under a contrast theme (#508).
- The 1.0 checklist lists both parked jobs as "the owner's call" with no position; keep it that way.

## Open rows worth knowing

- **New this session:** #507 (no exported OpenAPI file and no breaking-change check in CI; owner's call
  whether 1.0 waits on it, default no), #508 (the diagram's own colours under a contrast theme, by
  decision).
- **Closed this session:** #500, #501, #504, #505, #506.
- **Deferred review nits from #978** (not rows; small): assert the summary band's 1 px inset in
  `e2e-gantt/forced-colors.spec.ts`; a computed check that a finished task differs from a summary; a
  comment on the journey's `colourBehind`; optionally a hairline marking the selected row across the
  Gantt's chart half.
- **Not folded from #976's review:** the ordered lock now returns `{id, version}` to every caller (a
  small payload cost, unmeasured); a child filed under a summary between its unlocked read and the
  ordered lock is not in the locked set (pre-existing, unchanged; the plan lock is what excludes it).
- Older open rows are unchanged; see `docs/TECH_DEBT.md`.

## Suggested next

Nothing is in flight: no open PRs, no wake-ups armed. Ask the owner what to take next, offering, in this
order:

1. **The three 1.0 requirements**, each as its own spec through the feature-analyst:
   (a) a written, tested database backup and restore (the brief promised a daily snapshot kept 30 days;
   nothing documents one); (b) a whole-organisation export; (c) turning on and proving the recycle bin's
   90-day clear-out (`RETENTION_HIERARCHY_ENABLED`, irreversible hard delete — keep it a release of its
   own, `docs/RELEASE_1_0.md`). (a) is the smallest and the most important.
2. **A reconciliation pass** (`docs/RECONCILE.md`). The last was 2026-10-12; two ADRs (0190, 0191) have
   landed since, so `check:reconcile-due` is not yet triggered (threshold 8), but one is due at this epic
   boundary if the owner wants it.
3. The deferred nits above, as one small test PR.

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
