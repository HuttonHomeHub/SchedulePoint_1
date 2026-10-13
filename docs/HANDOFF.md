# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-13. The session planned, built and shipped the **pre-1.0 hardening pass**
(`docs/specs/pre-1-0-hardening/`, approved by the owner 2026-10-13, all nine milestones). Every PR
was squash-merged with all ten checks green on the pinned head.

## Where things stand

- **Releases this session:** `api` 0.89.3 (#965), `web` 0.190.0 (#968), and `web` 0.190.1
  (#971) for the ruler fix.
- **Hardening pass, by milestone:**

  | M   | What                                                     | PR(s)   | Release     |
  | --- | -------------------------------------------------------- | ------- | ----------- |
  | 0   | Spec and plan, approved                                  | #960    | —           |
  | 1   | Re-pack the four web e2e shards (ADR-0138 amendment)     | #962    | —           |
  | 2   | Deletes and restores take the plan lock in order (#492)  | #964    | api 0.89.3  |
  | 3   | Collapsed-spine journeys wait for the canvas (#497)      | #963    | —           |
  | 4   | Revision-delta spec picks its change set fixedly (#496)  | #966    | —           |
  | 5   | Gantt ⋯ menus and Float left clear of the divider (#494) | #967    | web 0.190.0 |
  | 6   | Zoom out / Zoom in in View ▾ › Zoom (#480)               | #969    | web 0.190.0 |
  | 7   | Ruler day numbers thinned at 200 % text (#478)           | #970    | web 0.190.1 |
  | 8   | Device check sheet, shard acceptance, new rows           | this PR | —           |
  | 9   | Owner's alerts guide (`docs/guides/set-up-alerts.md`)    | #961    | —           |

- **What changed for planners:**
  - deleting a plan, project or client no longer fails when a recalculation or a bar drag is running;
  - in the Gantt the ⋯ menus sit inside the table (48 px wider), clear of the divider, and the
    "vs baseline" values line up under their header; the zoom presets frame on the new width;
  - View ▾ › Zoom has Zoom out, Zoom in and Fit to plan in one row, usable when a dock has squeezed
    the diagram; zoom steps are announced ("Zoomed in." / "Zoomed out.");
  - at large text the diagram ruler shows every second calendar day (odd days, the 1st always) or
    only Mondays rather than overprinting, and re-measures when the text size changes.
- **CI shards:** the 2026-10-13 re-pack brought the slowest web shard to 1,047–1,067 s on four `main`
  runs (was up to 1,178 s). The four still finish up to ~235 s apart, with the short shard rotating —
  row #502. The fifth-shard trigger is now **slowest shard above 1,250 s (median of three runs) or a
  30-minute timeout** (owner, 2026-10-13; ADR-0138).

## Waiting on the product owner

- **Set up the alerts** with `docs/guides/set-up-alerts.md` (~15 minutes on the host; do the test
  part at a quiet time). Tell the next session when a test alert reaches the phone; that closes #100.
- **Run the device check sheet** (`docs/specs/pre-1-0-hardening/device-check-sheet.md`, ~1½–2 hours
  in two sittings). Reply with one line per step. Each "wrong" becomes a row or a fix; the answers go
  into a `device-check-results.md` beside it. Its contrast-theme steps are expected to confirm #505.
- Still parked by the owner (do not raise unless something changes): the toolbar "minor tweaks"
  (#499 — ask which before building), SC-16 photos, 72 rem confirmation, Surface sheet steps 25, 18b,
  25b, 26–28, the history count on or after 1 November, Gantt hands-on readings, header at 320/640.
- **Decided, do not reopen:** collaborative editing is not in 1.0; four web shards; `Start editing`
  stays plain while the pen is not held.

## Open rows worth knowing

- **New this session:** #500 (dissolve/remove with `?version=` lock the summary before the ordered
  lock), #501 (Gantt month labels at 200 % text, unmeasured), #502 (shard spread), #503 (one
  narrow-shell banner flicker, not reproduced), #504 (link-tool has no `lostReason`), #505 (forced
  colours: shaded menu items and Gantt bars — likely real, confirm via the device sheet), #506 (the
  Make-milestone journey runs within seconds of its 4-minute limit).
- **Narrowed:** #496 is now only the unexplained 401 mid-seed (suspected: a second process sharing
  `app_test`).
- **Closed this session:** #492, #494, #497, #480, #478.
- Older open rows are unchanged; see `docs/TECH_DEBT.md`.

## Suggested next

1. Read the owner's device-sheet answers when they arrive; fix or file each "wrong". #505 is the most
   likely real accessibility defect before 1.0.
2. Small pre-1.0 fixes ready to pick up: #504 (one `lostReason`), #505 (forced-colours rules), #500
   (lock order on the `?version=` paths).
3. A reconciliation pass is due at this epic boundary (`docs/RECONCILE.md`; the last was 2026-10-12).

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
