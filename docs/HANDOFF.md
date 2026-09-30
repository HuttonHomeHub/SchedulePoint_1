# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-09-30, after `api-v0.80.1` / `web-v0.153.3` (PR #729, release #730).

## Where things stand

- `main` is released. The working branch `claude/schedulepoint-project-setup-naacjj` is reset onto
  it and carries only this file and two register entries (below).
- **No approved work is waiting.** Every decision put to the product owner on 2026-09-29 is
  answered and built. The next batch needs a choice from the product owner (see "What could come
  next").
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped (2026-09-29 → 30, PR #729)

| Row     | What                                                                                                                                                                              | Where          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| #334 M3 | The activities table draws only the rows in view (ADR-0165). Opening at 2,000 rows went from 1,664 ms to 72–80 ms (`docs/specs/activities-panel-scale/m3-measurement.md`). Closed | `web-v0.153.3` |
| #402    | With the Late overlay on, each row says "late dates", and toggling the overlay is announced                                                                                       | `web-v0.153.3` |
| #413    | The resource chart and strip say that load is counted on earliest dates (the label only; the basis decision is still open)                                                        | `web-v0.153.3` |
| #412    | An unreadable request body is a 400/415 with a fixed message, never the parser's text or a 500                                                                                    | `api-v0.80.1`  |
| #415    | The unused form-body parser (100 KB from anyone) is removed                                                                                                                       | `api-v0.80.1`  |
| #414    | Each `pnpm prepush` run writes its own log                                                                                                                                        | repo           |
| #418    | The seeder batches WBS parentage at 2,000 rows per request                                                                                                                        | seed-http      |

Also: the 2026-09-29 reconciliation pass (`docs/DECISIONS.md`), and ADR-0165.

**One thing worth knowing about how #412 landed.** The first version tagged body-parser errors
with a wrapper around each parser. On CI it broke the base suite's sign-up journeys, mostly in
Firefox, and it never reproduced locally. It was bisected with temporary commits on the PR and
replaced by an Express error handler, which only runs for failing requests. How the wrapper broke
sign-up is still not known (`docs/DECISIONS.md`, 2026-09-30).

## Open rows that need a decision or a trigger

- **#413**: should the resource chart follow the bars as drawn? Decide together with levelling,
  which also works from earliest dates. Product-owner call.
- **#405 rename**: the "early…" fields in the revision-comparison data now carry placed dates. The
  product owner deferred the rename until something else forces a breaking change.
- **#416**: Better Auth's routes sit outside our body cap. Whether they are bounded is unverified.
  Needs a read of better-call's node adapter, plus security-reviewer.
- **#417**: switching the Late overlay in the Gantt view is not announced. Small; web.
- **#419**: selecting an activity on the diagram costs ~220–300 ms at 2,000 activities. This is
  container-only; it needs a reading on real hardware before anything moves (ADR-0128).
- **#420 (new)**: the csp suite's Arrange journey timed out twice on PR #729 waiting for a new
  client's link. It passed on retry. It is not caused by the body-parser change. Check whether it
  also happens on `main`.

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#417 + #416 as a small batch.** #417 is about an hour of builder work. #416 is a read first,
   then maybe a cap. Neither needs a spec.
2. **#413 with levelling.** A real decision. It needs feature-analyst (Opus) if the answer is "move
   both".
3. **Eight open Dependabot PRs** (#708–#715, #726), untouched this session. Worth a batch of their
   own. `better-auth` 1.7.6 touches #416's territory.

## Model switch points

- Start on **Opus** to frame the next batch's choices for the product owner.
- Switch to **Sonnet** once a batch is approved: build, reviews, sweep, release.

## Environment notes a new session would otherwise rediscover

- **A fresh checkout or worktree has no dependencies.** Run `pnpm install --frozen-lockfile
--offline`, `pnpm --filter "./packages/*" build` and `pnpm --filter @repo/api exec prisma
generate` before lint/typecheck/tests. **Turbo and ESLint caches replay stale results** until
  `apps/*/.eslintcache` is deleted. Do that before believing an api lint failure (`#411`).
- **`pnpm prepush` takes more than 10 minutes** on this 4-core machine. Give a background run at
  least a 30-minute limit, or it is killed partway through with no verdict.
- **The cloud container has Chromium only.** There is no Firefox or WebKit, and `playwright install`
  is not allowed. A Firefox-only CI failure cannot be reproduced here. It has to be bisected with
  temporary commits on the PR (about 15–20 minutes per round).
- **CI's Playwright artifacts (traces, screenshots) cannot be downloaded** from the container. The
  artifact host is blocked. The job log's tail is what you get. The base suite runs the API with
  `LOG_LEVEL: 'silent'`, so there are no server logs either.
- **The M0/M3 measurement harness** (`apps/web/scripts/measure-activities-panel.mjs`) now counts a
  windowed table's rows from `aria-rowcount`, and waits up to 120 s for the full list before its
  non-vacuity probe runs.
- **Builders' worktrees start from an old `main`, not your branch.** Tell every builder to begin
  with `git fetch origin <branch> && git reset --hard FETCH_HEAD`. Cherry-pick their commits back.
  `docs/TECH_DEBT.md` and `CLAUDE.md` counts conflict routinely: resolve the conflicts, don't
  discard either side.
- Run at most two builders at once; three concurrent prepush runs produce a no-detail `test`
  failure.
- **The container can restart mid-run** and kills background subagents. Check `git worktree list`
  and re-brief a fresh builder.
- `git reset --hard` may be refused by the permission layer. Use a fresh worktree or
  `git checkout --detach origin/main` instead.
- Agents must not run Playwright or `scripts/e2e-local.sh`: they share one database and fixed
  ports. The orchestrator runs them centrally.
- Release: merge the Version Packages PR despite its checks not running (`CLAUDE.md` §11). Confirm
  the tags with `git ls-remote --tags origin`. Find the Release run with `list_workflow_runs` on
  `release.yml`, filtered to `main`/`push` with `perPage: 2` (an unfiltered listing is huge). Then
  list that run's jobs.
