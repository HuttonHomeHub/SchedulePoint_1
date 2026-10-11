# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-11, after the **toolbar epic** — the owner's "make the toolbar amazing" request, the
landing and list-row defects found beside it, and the conflict reason (#479). All of it is on one open
pull request, **#915**, which was green on every check at head `ac49e0a` when this was written.

## Where things stand

- **PR #915** (`claude/determined-cerf-pskzjb` → `main`, 445 files, 83+ commits, web minor, `apps/api`
  untouched): all 10 checks green on `ac49e0a`, no review threads. **It is not merged.** The product
  owner merges it. If this hand-off commit moved the head, re-read the check runs for the new head first
  (`CLAUDE.md` §19.9: dedupe by name, every survivor `completed` / `success`; pin the merge to a SHA from
  `git ls-remote`).
- After the merge: reset the branch from `main` (`CLAUDE.md` §8), merge the **Version Packages** PR the
  Release workflow opens (its checks never run — read its diff, then merge with its head SHA), and confirm
  with `get_latest_release`.
- The product owner's screens: **monitor 1912 × 948** (mouse) and **Surface 1912 × 1114, DPR 1.5** (finger
  and stylus, 44 px targets). Design floor **1024 × 600** (ADR-0179).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, reviewers are Sonnet,
  **explorer** (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What this epic shipped (all in #915)

- **Landing and lists:** the one-column landing gap (item 0); a landing box is a tab stop only when it
  scrolls (#474); a list row's subject wraps and never clips (#472, **ADR-0184**).
- **Toolbar redesign, M0–M7 (ADR-0185)**, specs and measurement records in `docs/specs/toolbar-redesign/`:
  - a **promotion ladder** — six rem stages (80 / 90 / 100 / 119.5 / 135 / 160) from widths measured in a
    real browser (`promotion-widths.{fine,coarse}.json`, `apps/web/src/features/tsld/toolbar/promotion-ladder.ts`)
    that move commands out of menus onto the bar as width allows; anchors never leave their menu (Link keeps
    Start → Finish, Add keeps Task and Level of Effort, Filter keeps Has constraint, Analysis keeps
    Baselines…, Share & export keeps the formats and Print); a computed "no tool is lost" manifest
    (`command-manifest.json`, `pnpm --filter @repo/web manifest:commands`);
  - focus hand-off and announcements when a control moves between bar and menu, and when a stage change
    closes an open menu (`useCloseWhenChanged`, `usePromotionFocusFollow`, `useToolbarFocusHandoff`);
  - zoom / fit / minimap in the diagram's corner; below 1024 the editing row leads the scrolling line (DOM
    order = visual order); `Deck` row order in `use-deck-row-order.ts`;
  - the **visual brief**: quiet group pills, a row mark, quiet shading that survives forced colours, an
    outlined Export / Share closing action, a Filter count badge, icon-only Baseline overlay (Diff glyph),
    Comments, Settings and Resource view, the organisation switcher as a ghost button + radio menu;
  - the inert `tier` concept removed (#193); header and command-band height at small windows fixed (#471).
- **Conflict reason on the object (#479, ADR-0186)**, `docs/specs/conflict-reason-on-object/`: a caption
  line above the selection bar says why an activity is flagged; the toolbar chip stays a count. The same
  words feed the announcer, the diagram's listbox option and the Gantt row.
- **CI:** the promotion journey has its own step and config (`playwright.promotion.config.ts`,
  `test:e2e:promotion`); shards were repacked (`scripts/e2e-durations.json`).

## Waiting on the product owner

- **Merge #915**, and **sign off the photographs** (spec SC-16): `docs/specs/toolbar-redesign/photos/m6-*`
  (before / after, mouse and finger, pen held and not held). He has looked at the main ones and said they
  look ok; the sign-off is not yet recorded in `m6-measurement.md`.
- **Decided, do not reopen:** `Start editing` stays plain while the pen is not held. Amber is reserved for
  the held state (ADR-0133); making it amber too would need a new public `ToolbarButton` prop (ADR-0105).
  The product owner said "leave it as it is" on 2026-10-11.
- **CI time (TECH_DEBT #491):** the web e2e total is 2,393 s, over the 2,372 s re-open trigger in
  `docs/specs/ci-sharding/m4-measurement.md` §7; shards project to about 596 / 598 / 600 / 599 s against a
  593 s budget. The record says re-measure over **three CI runs** before adding a fifth shard — his call.
- **Header at 320 / 640 wide on touch** is 192 / 220 px and 96 / 108 px tall (#490, unchanged by this epic;
  mobile is unsupported). Recommended: leave.
- **Confirm 72rem** for the page-grid split (ADR-0182 "CQ-2 threshold provisional"); the tap-to-answer page
  (<https://claude.ai/artifact/Mw5537uKYi8bXimcMU1kYY>, answers in its `rowchecks` collection) had no
  answers at 2026-10-09; Surface sheet **step 25**; the **history count on or after 1 November**
  (ADR-0174 / #443: staff console → Tools → Run diagnostics → Copy results); **Gantt hands-on readings**.
  All unchanged from the previous hand-off.
- **Not exercised on real hardware:** the Filter badge on a real display, the long-press tooltip on real
  touch, any screen reader, and CI's own font rendering (see the environment notes).

## Open rows from this epic

- **#482** zoom presets in the diagram corner and search-field growth at 2560 (deferred, not built).
- **#483** at 200 % text-only the breadcrumb collapses to "R… / P" (1.4.4, predates this epic).
- **#484** touch 1024 × 600: the Do row wraps its tail onto a third line.
- **#485** the remedy button sits far from the reason on wrapped bars (needs an ADR-0111 review: it
  touches roving order). **#486** the warning triangle repeats up to three times on one bar; a stray
  icon-only canvas control in the Gantt dock. **#487** at 200 % text on touch 1024 the selection bar's tail
  is clipped (predates #479). **#488** the touch 1024 × 600 stage is 122 px against a 120 px floor — two
  pixels of margin; the foot row is deliberately `pointer-coarse:py-0.5`.
- **#489** the foot-row outlet (D-j). **#490** the header at 320. **#491** the CI budget above.
- **#481** `HistoryResultStrip` could adopt `useContainerUnmountHandoff` (its destination is a callback,
  so not a drop-in).
- Carried over, unchanged: **#473** (Explorer splitter fails axe `region`), **#475** (two stale statements,
  one fixed), **#476** (a `PanelResizer` grab strip is 25 px), **#442**, **#469**, **#470**, **#456**,
  **#454**, **#449**, **#450**, **#440–#446**, **#435**, **#432**, **#429**, **#419**, **#405**.
  `wip/history-numerator-preaggregate` (`64ff45d4`) is still the first remedy to measure when the 250,000
  trigger fires.
- Closed by this epic: **#471, #472, #474, #479, #193** (these are register rows, not GitHub issues).

## Suggested next

1. Merge #915, release, reset the branch from `main`.
2. The product owner's answers above (photos, 72rem, tap page, fifth-shard decision after three CI runs).
3. Whichever of #485 (remedy near the reason, needs ADR-0111 review), #487 or #483 (200 % text) he wants
   first; each needs its own spec if it adds surface (ADR-0105). Planning is Opus work; building is Sonnet.

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
  button appears first (fixed in this epic; recorded under #435).
- **A stale API server on :3000 poisons later local runs** (`curl -s localhost:3000/api/v1/health` should
  return nothing). Never let two DB-backed runs overlap.
- **CodeQL flags `new StorageEvent('storage', { key })`** and stat-then-read directory walks; use
  `apps/web/src/test/storage-event.ts` and `readdirSync(dir, { withFileTypes: true })`.
- **`check:counts` trips on every new web source file** (the `CLAUDE.md` banner count); a new test file
  counts too. Adding an ADR also moves the ADR count (186 today).
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
