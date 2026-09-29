# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-09-29, after `api-v0.80.0` / `web-v0.153.1` (PR #724, release #725) and
`web-v0.153.2` (PR #727, release #728).

## Where things stand

- `main` is released and published; the working branch `claude/schedulepoint-project-setup-naacjj`
  is reset onto it and carries only this file.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- The **reconciliation pass is due** (advisory `check:reconcile-due`; last pass 2026-09-23, ADRs
  have since been added). Run it in a planning stretch, not mid-build.

## What shipped (2026-09-29)

| Row      | What                                                                                                                              | Where          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| #402     | Late overlay's spoken sentences read late dates                                                                                   | `web-v0.153.1` |
| #404     | "Project finish" states the placed finish (summary, guest view, recalculate response)                                             | `api-v0.80.0`  |
| #405 (a) | Revision comparison compares placed spans; new `datesBasis: PLACED \| NETWORK` on both routes                                     | `api-v0.80.0`  |
| #405 (b) | Landing "where each programme stands" compares placed finishes (no schema change; EXPLAIN in the row)                             | `api-v0.80.0`  |
| #405 (c) | Earned Value planned value phased on placed dates (spec `docs/specs/ev-placed-planned-value/`, ADR-0042/0044 amendments accepted) | `api-v0.80.0`  |
| #407     | Oversize body → 413 with the envelope; 512 KB on authenticated org routes (credential-presence guard), 64 KB elsewhere            | `api-v0.80.0`  |
| #334 M2  | Render isolation for the activities panel and its rows (PR #727)                                                                  | `web-v0.153.2` |

## Open decisions for the product owner

1. **#334 M3 (windowing)** — needs an ADR and CQ-B. Not approved, not started. M2's effect is
   **unmeasured**: the M0 harness (`apps/web/scripts/measure-activities-panel.mjs`) re-read of
   I2/I3/I4 is owed on real hardware (a full sweep is ~40 minutes of seeding). E1 (mount cost) is
   untouched by M2 and is what M3 would address.
2. **#402 accessibility questions** (from the accessibility review, none blocking): should a row
   say it is speaking late dates; should float/drift wording switch to late under the overlay
   (today it stays on the placed basis while dates are late); should toggling the overlay be
   announced. Product calls, not bugs.
3. **#405 field names** — the revision comparison's public fields still say `early*` while carrying
   placed dates under `datesBasis: PLACED`. Renaming to basis-neutral names is the recorded
   follow-up (note inside the #405 row); it is a breaking public-contract change.
4. **#407 limit** — the brief said ~256 KB; a 2,000-row placements body measures ~292–356 KB, so the
   authenticated limit is **512 KB**. Say if you want it different.

## Model switch points

1. Start the next session on **Opus** for a spec/ADR (#334 M3's ADR, the reconciliation pass).
2. Switch to **Sonnet** for build, reviews, sweep and release once a brief is approved.

## Environment notes a new session would otherwise rediscover

- **A fresh checkout or worktree has no dependencies.** Run `pnpm install --frozen-lockfile
--offline`, `pnpm --filter "./packages/*" build` and `pnpm --filter @repo/api exec prisma
generate` before lint/typecheck/tests. **Turbo and ESLint caches replay stale results** (14
  spurious "unsafe type" lint errors) until `apps/*/.eslintcache` is deleted — do that before
  believing an api lint failure.
- **Builders' worktrees start from an old `main`, not your branch.** Tell every builder to begin
  with `git fetch origin <branch> && git reset --hard FETCH_HEAD`, or it will not see your briefs,
  specs or helpers. Cherry-pick their commits back; `docs/TECH_DEBT.md` and `CLAUDE.md` counts
  conflict routinely — resolve, don't discard.
- The machine has **4 cores**; three concurrent `pnpm prepush` runs take 17+ minutes and produce a
  no-detail `test` failure that passes alone. Run at most two builders at once.
- **The container can restart mid-run** and kills background subagents; check `git worktree list`
  and re-brief a fresh builder rather than waiting.
- `df -h /` before a sweep; clear per-run build caches in `/tmp` above ~85%.
- `e2e-library` fails locally on a strict-mode `getByText('Crew A')` and passes in CI — an
  environment difference.
- Agents must not run Playwright or `scripts/e2e-local.sh`: they share one database and fixed
  ports. The orchestrator runs them centrally (`scripts/e2e-local.sh api`, then `web` and named
  `web:<suite>` targets).
- Release: merge the Version Packages PR despite having no check runs (`CLAUDE.md` §11), then
  confirm the `api-v*` / `web-v*` tags and the Release run's two publish jobs
  (`actions_get list_workflow_jobs` on the run; do **not** list the workflow's runs — the payload is
  huge).
