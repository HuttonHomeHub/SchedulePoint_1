# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-04, at the end of the 2026-10-03/04 batch: the change-history epic (ADR-0174),
Gantt column widths (ADR-0173), the soft-delete gate (ADR-0172), the throttle-visibility epic
(ADR-0175) and four register fixes.

## Where things stand

- `main` holds everything below. The working branch `claude/schedulepoint-project-setup-naacjj`
  carries only this file.
- **No approved build work is waiting.** Two items are owed but blocked on something outside a
  session (below).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped in this batch

| PR                     | What                                                                                                                                                                                                                                                                     | Release                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| #768                   | #434: "1 activity moves up" when dissolving a one-child summary                                                                                                                                                                                                          | web 0.159.1                           |
| #770                   | #431: a sideways move of a started activity is refused in both views                                                                                                                                                                                                     | web 0.159.2                           |
| #772                   | #436: removed members are no longer counted or named on the overview and staff console                                                                                                                                                                                   | api 0.84.1                            |
| #774                   | #435 first pass: onboarding screen warmed, sign-up waits aligned                                                                                                                                                                                                         | web 0.159.3                           |
| #776                   | ADR-0172 soft-delete gate: every soft-delete query states its stance or the build refuses it; baseline `_count` counts live rows (#441)                                                                                                                                  | api 0.84.2                            |
| #778, #781             | ADR-0173 Gantt column widths: typed widths in View ▾ Columns (M1), header drag edges (M2), remembered per device                                                                                                                                                         | web 0.160.0, 0.161.0                  |
| #784                   | ADR-0174 change history M1: a **History** tab in the activity editor — who changed what, links on both ends, resources, names as at the time                                                                                                                             | api 0.85.0, web 0.162.0, types 0.41.0 |
| #787                   | ADR-0174 M2: group moves, levelling's apply, re-parent/dissolve, cross-plan links, and knock-on entries when a neighbour is deleted/restored                                                                                                                             | api 0.86.0, web 0.163.0, types 0.42.0 |
| #789                   | ADR-0174 M3-T1: expiry measured with history rows; `HISTORY_ROWS_PER_ACTIVITY` 1 → 5 (`m3-measurement.md`)                                                                                                                                                               | api 0.86.1                            |
| #779, #783, #786, #791 | ADR-0175 throttle visibility: a journey that meets an API 429 fails **by name**; lint enforces the guarded `test`; activity-editor signs up once per worker; six suites' `100000` limits replaced with measured ceilings; census counts per handler across organisations | none (tests and docs)                 |

Every release above had its "Build & push" jobs confirmed.

## Product-owner decisions recorded this batch

- **History write cost (2026-10-04, two decisions):** the three-statement count is the binding bar
  and the millisecond figures are recorded as misses (#443 is the host re-measure); delete/restore
  cascades ship on the 150 ms absolute bar (#444 is the probe trim). Both in ADR-0174 Consequences.
- **History expiry ratio (orchestrator decision, recorded in `m3-measurement.md`):** set to 5, below
  the measured 8–10 warm quotient, because cold rows cost more. No pre-pass until measured cold and
  interleaved on the host (#443 now covers that).

## Owed, and blocked on something outside a session

1. **Gantt column widths — two hands-on readings from the product owner** (asked 2026-10-04,
   answered "not tried yet"; do not nag):
   - drag smoothness on a ~2,000-activity plan at Week zoom on their usual computer;
   - a **finger** drag of the Code header edge on their Surface Pro.
     Record them in `docs/specs/gantt-column-resize/m2-measurement.md`, then flip that spec's headers
     to the shipped form.
2. **History M3-T2 — the real row rate** (ADR-0174): on the product owner's host, **four weeks after
   2026-10-04** (so from ~2026-11-01), count entries per plan per day, bytes per entry and the
   `LOGIC`/`RESOURCES` share, and replace the spec's estimate. Retention trigger: any plan above 1M
   entries.

## Open rows worth knowing

- **#435** stays open under its own rule: **ten consecutive green CI runs**. The cause (429 on
  `GET /me` on CI runners) is remedied by #786; the count stood at **4 of 10** at the end of
  2026-10-04 (#786, #787, #789, #791, all four web shards green). The row itself says 2 of 10 —
  update it when the count next moves.
- **#440** placement/recalc deadlock, **#442** `PanelResizer` single-pointer, **#443** history write
  and expiry cost measured only on the container, **#444** batch history probe reads the whole
  latest entry, **#445** a deleted neighbour's name outlives retention in history (deferred, trigger
  on an erasure request or per-plan permissions), **#446** the throttler buckets per address so an
  office behind one NAT shares one bucket (deferred, trigger in the row).
- **#433** (plan refresh behind production cache headers) is still the cheapest open measurement.
- Spec headers still saying **Approved** that should be flipped to the shipped form at the next docs
  change touching them: `docs/specs/resource-group-dissolve/`, `docs/specs/activity-change-history/`
  (M3-T2 still open), `docs/specs/e2e-throttle-visibility/`.

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#433**: measure plan refresh on the live server.
2. **#444**: trim the history probe (smaller delete/restore cost).
3. **#440**: the placement/recalc deadlock.
4. Anything from `docs/BACKLOG.md`; a new feature starts with **feature-analyst**.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **Clear the Vite prebundle after any `@repo/types` change**: `rm -rf apps/web/node_modules/.vite`.
  A stale prebundle misses new exports and every journey fails on "Something went wrong" — it cost a
  19/19 local failure this batch.
- **The container restarts.** Worktrees survive; `.git/info/exclude` (which hides
  `.claude/worktrees/`) does not — re-add it, then reinstall/rebuild per worktree.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only.** It stops
  `pnpm prepush`'s turbo `test` early, so run `pnpm turbo run test --continue --filter=@repo/web
--filter=@repo/api` separately. `check:reconcile-due` warns on a shallow clone; that is expected.
- **Never run unit suites or builders at the same time as an e2e job**, and never two e2e jobs at once.
  Agents must not run Playwright or `scripts/e2e-local.sh`, and must never kill processes they did not
  start.
- **The throttle census** (`E2E_THROTTLE_CENSUS=1 scripts/e2e-local.sh web:<suite>`) prints the
  busiest handlers per 60 s, now grouped per handler across organisations. To measure a suite whose
  config carries a ceiling, raise it temporarily and **do not commit** the raise; the stop hook will
  complain — that is expected.
- **The `measure-*` Playwright configs are manual harnesses**, not CI; they import plain
  `@playwright/test`, so the census cannot see them.
- **`gh` works through the proxy** for reading check runs and workflow runs; CI trace and artifact
  downloads are blocked.
- **`check:counts` re-derives the CLAUDE.md banner numbers.** Adding a web source file (tests under
  `src/` count) fails it.
- **Commit bodies are limited to 100 characters per line** (commitlint), as well as PR title + " (#N)".
- **No Firefox in the container** — `/opt/pw-browsers` has Chromium only.
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web". The Version Packages PR's checks show
  `action_required` and never run; merge it once its diff is the expected bump.
- **Wake-ups worked this session** (`send_later` ~25 min, re-armed on each firing). A message that
  arrives late is still a firing; check `list_triggers` before arming a second one.
