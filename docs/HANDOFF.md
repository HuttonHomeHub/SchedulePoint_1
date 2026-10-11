# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-11 (evening), after the "outstanding items" sweep: the register's open rows worked
through in groups, five pull requests, each squash-merged with all ten checks green on the pinned head.

## Where things stand

- Merged to `main` this session: **#918** (group 3 correctness; `api` 0.89.0 via #919), **#920** (selection
  bar, ADR-0187; `web` 0.185.0 via #921), **#922** (dividers, checkboxes, landmark, press-to-type size box,
  ADR-0188; `web` 0.186.0 via #923), **#924** (web halves of #405 and #450; `web` 0.186.1 via #925), **#926**
  (group 4 tidy, tests and performance; no web change). For #926, check the Version Packages PR (an `api`
  patch); it may be open or merged. Tags: `api-v0.89.0`, `web-v0.185.0`, `web-v0.186.0`, `web-v0.186.1`.
- The product owner's screens: **monitor 1912 x 948** (mouse) and **Surface 1912 x 1114, DPR 1.5** (finger
  and stylus, 44 px targets). Design floor **1024 x 600** (ADR-0179).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, reviewers are Sonnet,
  **explorer** (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped, per register row

- **#449** a calendar or resource-limit edit marks the plans that use it as edited since calculated.
  **#440** activity row locks are ordered for placements, lane moves and recalculation (the remaining bulk
  writers are open row #492). **#456** a staff diagnostics press is one read-only, 3 s-bounded transaction
  (ADR-0140 amended).
- **#405 and #450** the revision comparison has basis-neutral date names beside the deprecated `*Early*`
  fields (removing those needs its own ADR); single deletes and dissolve take an optional `?version`, and web
  undo and redo now pass it.
- **#485 and #487** the selection bar leads with its subject and the dock floors are capped (ADR-0187).
  **#489, #486, #488, #484, #482** closed with evidence. The "Float paths" label was decided **not built**: it
  adds a line in 8 of 80 measured readings.
- **#470, #473, #476, #442** 44 px touch targets, the Explorer landmark, and the divider press-to-type size
  box; no key opens it (ADR-0188). **#483** closed: it does not reproduce under a real text-size setting.
- **#454, #469, #432, #441, #444** built or closed as measured (#454 stays deferred on its trigger).
  **#429** not reproduced (20 runs, up to a 5 s delay) and left on its trigger. **#481, #443, #419, #445,
  #446** left on their triggers. **#435** closed (10 clean CI runs) and **#475** closed.

## Waiting on the product owner

- **Sign off the toolbar photographs** (SC-16): `docs/specs/toolbar-redesign/photos/m6-*`. He has said the
  main ones look ok; the sign-off is still not recorded in `m6-measurement.md`.
- **Decided, do not reopen:** `Start editing` stays plain while the pen is not held (amber is reserved for the
  held state, ADR-0133).
- **Confirm 72rem** for the page-grid split (ADR-0182 "CQ-2 threshold provisional"); the **tap-to-answer page**
  (<https://claude.ai/artifact/Mw5537uKYi8bXimcMU1kYY>, answers in its `rowchecks` collection) had no answers.
- **Surface sheet** (`docs/specs/gantt-coarse-pointer/device-checklist.md`): step **25** and the new steps
  **18b, 25b, 26, 27, 28**. Step 28 is Safari on iPad: clicking Reset must not close the size box before it
  acts. Step 26 is a finger-jitter reading for the 4 px press slop.
- **The history count on or after 1 November** (ADR-0174 / #443: staff console, Tools, Run diagnostics, Copy
  results). **Gantt hands-on readings.**
- **CI time (#491):** the total passed the re-open trigger earlier and the new `dividers.spec.ts` adds about
  30 s. `scripts/e2e-durations.json` was not updated (`workspace-fit` carries a harvested figure). Decide
  whether to add a fifth shard after re-measuring.
- **Header at 320 / 640 wide on touch** (#490): mobile is unsupported; recommended leave.
- **Not exercised on real hardware:** the Filter badge on a real display, the long-press tooltip on real
  touch, any screen reader, and CI's own font rendering.

## Open rows

- From this work: **#492** (remaining unordered activity-lock writers), **#493** (axe `region` on a plan
  page's command-band slot), **#494** (Gantt 25 px strip covers about a third of each row menu, pre-existing),
  **#495** (`SizeField` vs `TextField` drift), **#496** (the `revision-delta-m0` e2e spec fails intermittently
  on a local database; it passed CI on every recent PR).
- Carried over, still open: **#490, #491, #481**, **#474** (built; delete the row once confirmed merged),
  **#477, #478, #480, #437**, **#443, #445, #446, #419, #429, #454**, and the older **#401, #403, #406,
  #408-#411**. `wip/history-numerator-preaggregate` (`64ff45d4`) is still the first remedy to measure when the
  250,000 trigger fires.

## Suggested next

1. The owner items above.
2. The big parked idea: **real-time collaborative editing** is the candidate headline feature for a 1.0. The
   owner parked it on 2026-10-11 to clear outstanding items first. It needs a **feature-analyst** spec on Opus;
   nothing is built.
3. A hardening pass before 1.0: real-hardware and screen-reader checks, the staff console's "live but unwired"
   alert signals (`CLAUDE.md` §17), and the flaky spec (#496).
4. Whichever open row the owner picks; each needs its own spec if it adds surface (ADR-0105).

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
