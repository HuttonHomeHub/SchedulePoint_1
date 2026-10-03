# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-03, after the route code-splitting epic (#760, ADR-0171) and its release (#761, web 0.158.0).

## Where things stand

- `main` holds everything below. The working branch `claude/schedulepoint-project-setup-naacjj`
  carries only this file. (This session ran 2026-10-02 to 2026-10-03.)
- **No approved work is waiting.** Everything the product owner chose on 2026-10-02 has shipped.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped on 2026-10-02 and 2026-10-03

| PR   | What                                                                                                                                                                                                                                                                       | Release                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| #755 | #430 text typed during an editor save is kept (`resetKeepingLaterEdits`); #399 import-report text bounded (truncated, never refused); #390 import layout checkbox `aria-busy`; #400 a tooltip no longer covers its trigger                                                 | web 0.156.2, api 0.83.1 (#756) |
| #757 | Gantt start-edge resize (ADR-0170): drag a bar's left end, finish held; Gantt drags and typed dates count working days (was calendar days); started/finished activities' Start cell is read-only with its reason; bar writes announce after the save; LOE loses its resize | web 0.157.0 (#758)             |
| #759 | Gantt M3 docs: CLAUDE.md banner now says the Gantt **delivers** the brief's §8 Must-have                                                                                                                                                                                   | none (docs)                    |
| #760 | Route code splitting (ADR-0171): every screen but sign-in loads when opened; `boot`/`ui-shared` chunk groups; plan preload on plan URLs; idle warm-up; pending skeleton; chunk-failure screen; `index.html` no-cache; bundle gates B8a/B8b and the B9 chunk-cycle gate     | web 0.158.0 (#761)             |

Route splitting numbers (same container, 7 runs, 1.6 Mbps / 150 ms): sign-in 2,797 → 1,398 ms
(−50%); plan deep link +8.3% (limit 10%); in-app plan open +4.9% (limit 5%, indeterminate);
**plan refresh +17.0% — accepted by the product owner** (vite preview revalidates; nginx is immutable).
Entry graph 461,186 → 176,749 gzip bytes.

## Open rows that need a decision or a trigger

- **#433** (new): re-measure the plan refresh path with production cache headers (nginx in the
  harness, or the live host; over h2 if the upstream speaks it). Trigger: the next chunking/preload
  change or a planner reporting slow refreshes.
- **#431** (new): the diagram still lets a started activity's start edge write an inert placement
  (the Gantt now refuses it). Decide whether the diagram should match.
- **#432** (new): the Gantt-editing journeys' `useEightHourCalendar` fixture is Tue–Sat (API
  numbers Monday 0). Recorded, not fixed.
- **#429** popup flake (trigger: second occurrence); **#419** selection cost at 2,000 (needs a
  real-hardware reading); **#405** rename (deferred until a breaking change).
- **HTTP measurement of the levelling preview** is still owed.

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#433**: measure plan refresh on the live server (cheap; settles the accepted trade-off).
2. **#431**: make the diagram refuse a start-edge drag on a started activity, like the Gantt.
3. **#419**: selection cost on real hardware (needs the product owner's machine).
4. Anything from `docs/BACKLOG.md`; a new feature starts with **feature-analyst**.

## Model switch points

- Start on **Opus** to frame the next batch's choices; switch to **Sonnet** once approved.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too (a worktree
  without `prisma generate` fails the e2e API boot with TS2339 on `$transaction`).
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only.** It also
  stops `pnpm prepush`'s turbo `test` early, so run `pnpm turbo run test --continue --filter=@repo/web
--filter=@repo/api` separately to be sure web and api tests ran.
- **The container restarts often** (several times on 2026-10-02). Background `&` jobs die silently —
  use `run_in_background` and re-check logs after a restart. Agents' commits survive in
  `.claude/worktrees/*`; the reminder trigger list can come back empty, so re-arm.
- **Never use the global `prettier`** (`/opt/node22/bin/prettier`, 3.8.1); it re-wraps CLAUDE.md
  §19.12. Use `pnpm exec prettier` (3.9.9).
- **Timing harness:** `ROUTE_SPLIT_LABEL=<label> scripts/e2e-local.sh measure:route-splitting`
  (output `apps/web/measure-output/route-splitting-<label>.{json,md}`, gitignored). Compare only
  readings taken on the same machine; the container's CPU changes across restarts.
- **Agents must never kill processes they did not start**, and must not run Playwright or
  `scripts/e2e-local.sh` (the orchestrator runs them; one harness run may be authorised explicitly).
- **Never run two e2e jobs at once, and never change the checkout during one.**
- **GitHub runners sometimes spend ~20 minutes installing Playwright**; one re-run is right (§19.9).
- **A PR title plus " (#N)" must be ≤ 100 chars** (`pr-title.yml`).
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web" (api is skipped when only web released).
- `.claude/worktrees/` is excluded via `.git/info/exclude` in this container only.
