# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-12 (evening). The session covered three pieces of work:

- the reconciliation pass;
- the **toolbar-grid** epic, from spec to sign-off;
- the web end-to-end shard re-pack.

Every PR was squash-merged with all ten checks green on the pinned head.

## Where things stand

- **Reconciliation pass (2026-10-12):** docs-drift PRs #929–#933, with the pass logged in
  `docs/RECONCILE.md`. The next full pass is due at the next epic boundary, or three months at the latest.
- **Toolbar-grid epic** (`docs/specs/toolbar-grid/`, ADR-0189): **shipped and signed off.** M4 (shared
  columns) was withdrawn by the owner after M0.

  | Milestone                       | PR   | Release     |
  | ------------------------------- | ---- | ----------- |
  | M1 dividers                     | #935 | web 0.187.0 |
  | M2 switches and joined units    | #937 | web 0.188.0 |
  | M3 quiet icons and stray bits   | #949 | web 0.189.0 |
  | M5 after record and photos      | #951 | —           |
  | M5 command-band landmark (#493) | #952 | web 0.189.1 |
  | M5 ADR-0189 and close-out       | #953 | —           |

- **E2E shards** (#955, ADR-0138 amended): the four web shards are re-packed longest-first to about
  890 s of suite time each. The owner chose to rebalance four over adding a fifth. #491 is closed. The
  five-shard design stays documented in `docs/specs/e2e-fifth-shard/`, with its trigger: a slow run that
  puts a web shard above `quality` again.
- **The product owner's screens:**
  - monitor 1912 × 948 (mouse);
  - Surface 1912 × 1114 at DPR 1.5 (finger and stylus, 44 px targets);
  - the design floor is 1024 × 600 (ADR-0179).
- **Model routing** is pinned in `.claude/agents/`:
  - **builder** (Sonnet) implements;
  - reviewers are Sonnet;
  - **explorer** (Haiku) searches;
  - planners are Opus.

## What the toolbar-grid epic changed (for anyone touching the toolbar)

- **Boxes are gone.**
  - Groups are separated by a hanging divider (`DECK_GROUP_DIVIDER`).
  - Rows clip with `deck-row-clip` (overflow-clip-margin 5 px, so the forced-colours focus ring survives).
- **Pick-one sets are switches.** Colour and Diagram | Gantt use a recessed track with the chosen
  member raised (fill plus underline). Under forced colours the chosen member uses Highlight / HighlightText.
- **Joined units:**
  - Undo, Redo and Recent edits form one unit, in reading order.
  - The Link Type set is joined too.
  - The registry declares these with `cluster: {id, kind}`.
- **Quiet icons:**
  - `toolbarIconClass` plus a `quietIcons` opt-in on the Deck and header toolbars.
  - The pen is the only bright control.
  - #498 is the follow-up: a `ToolbarSurfaceContext`, and the selection bar.
- **Stray bits:**
  - Baseline shows its word at roomy-fine.
  - The milestone presets show "Start/Finish milestone"; their accessible names still say "Add: …".
  - Recent edits uses the History glyph.
  - Settings is a `groupTail`, placed last in the DO row from 80 rem of viewport. Its focus is restored
    when it moves.
  - Add and Undo are `ruleBefore`, ruled from a 79 rem container.
- **The band is a landmark:** `region "Plan command band"`.
- **CSS budget:** 19.00 KiB, against 18.05 KiB used (`apps/web/bundle-budget.json`).
- **Measured side effects the owner was told about:**
  - At 1912 with a mouse, Earned value now sits inside the Analysis menu.
  - With a coarse pointer and Link armed, the DO row wraps to two lines at 1280 and 1440.

  Both are recorded in ADR-0189 and in `m-final-measurement.md`.

## Waiting on the product owner

- **Toolbar "minor tweaks at some point"** (#499). The owner signed off with these words, unspecified.
  **Ask which tweaks before building anything.**
- **Unanswered from the reconciliation pass:**
  - which of the waiting items below to take;
  - whether to spec **real-time collaborative editing** for a 1.0.
- **Ten Dependabot PRs, #938–#947**, are open and untouched. They need a triage decision. Note that the
  `@playwright/test` 1.64 bump changes the browser build.
- Carried over from the previous hand-off, still unanswered:
  - **SC-16 sign-off** of the older toolbar-redesign photos (`docs/specs/toolbar-redesign/photos/m6-*`).
  - **Confirm 72 rem** for the page-grid split (ADR-0182; the tap-to-answer page
    <https://claude.ai/artifact/Mw5537uKYi8bXimcMU1kYY> has no answers).
  - **Surface sheet** steps 25, 18b, 25b, 26, 27 and 28
    (`docs/specs/gantt-coarse-pointer/device-checklist.md`).
  - **The history count on or after 1 November** (ADR-0174 / #443).
  - **Gantt hands-on readings.**
  - **Header at 320 / 640 wide on touch** (#490): the recommendation is to leave it.
- **Decided, do not reopen:**
  - `Start editing` stays plain while the pen is not held (ADR-0133).
  - Four web shards, not five (2026-10-12).
- **Not exercised on real hardware:**
  - the toolbar's forced-colours rendering on Windows High Contrast;
  - the gear's focus restore on a real tablet rotation;
  - any screen reader.

## Open rows

- **New this session:**
  - **#497**: the `command-surface.spec.ts` collapsed-spine journeys read the canvas width before resize.
  - **#498**: the quiet-icons follow-ups.
  - **#499**: the owner's tweaks.
- **Still open:**
  - **#492**: the remaining unordered activity-lock writers.
  - **#494**, **#495**, **#496**.
  - **#490**, **#481**, **#477**, **#478**, **#480**, **#437**, **#443**, **#445**, **#446**, **#419**,
    **#429**, **#454**.
  - The older **#401**, **#403**, **#406** and **#408–#411**.
- **Closed this session:** **#493** (landmark) and **#491** (shards).

## Suggested next

1. Ask the owner the open questions above: #499's tweaks, the Dependabot triage, and the collaborative
   editing spec.
2. If collaborative editing is wanted: a **feature-analyst** spec on Opus. Nothing is built.
3. A hardening pass before 1.0:
   - real-hardware and screen-reader checks;
   - the staff console's unwired alert signals (`CLAUDE.md` §17);
   - #496 and #497.
4. Watch the CI runs after #955. #955's own run (38302288727) already finished one web shard after `quality`:
   - web shards: 815 / 981 / 1,076 / 1,178 s;
   - `quality`: 1,064 s.

   That is the five-shard trigger on a single sample. Two other PRs' CI was running at the same time, so
   read two or three quiet runs before putting the five-shard spec (`docs/specs/e2e-fifth-shard/`) back to
   the owner.

## Environment notes a new session would otherwise rediscover

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
