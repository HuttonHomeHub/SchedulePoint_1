# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-09-29, after `api-v0.79.0` / `web-v0.153.0` (PR #721, release #722).

## Where things stand

- `main` is released and published; the working branch `claude/schedulepoint-project-setup-naacjj`
  is reset onto it.
- The eight-row batch (#356, #359, #396, #357, #99, #353, #334 M1, #248) shipped. #334 stays open
  for M2/M3.
- Model routing is now pinned in `.claude/agents/`: use **builder** (Sonnet) for implementation,
  **explorer** (Haiku) for search. Never send implementation to `general-purpose`.
- The reconciliation pass is **due** (advisory `check:reconcile-due`: 9 ADRs since 2026-09-23,
  threshold 8). Run it in a planning stretch, not mid-build.

## Next batch — approved by the product owner, 2026-09-29

Run the rows below as one batch on **builder** agents, then #334 M2. The decisions below are made;
the builder must not reopen them.

| Row          | Decision                                                                                                                                                                                                    | Spec needed?                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#402**     | Thread the resolved `barDateSource` into `TsldPanel.tsx`'s `rowTextById` `describeActivity` call and its memo deps, so the Late overlay's sentences read late dates.                                        | No — register row.                                                                                                                                                     |
| **#404**     | "Project finish" states the **placed** finish (max drawn finish), on the member summary and the guest view alike.                                                                                           | No — register row; cite ADR-0148.                                                                                                                                      |
| **#405 (a)** | Revision comparison: `REDATED` and the ghosts compare **placed** spans; baselines captured before placement (`placementSnapshotLevel: NONE`) fall back to earliest-vs-earliest, as #359 did.                | No — completes #359 / ADR-0025 Am. 3.                                                                                                                                  |
| **#405 (b)** | Landing "where each programme stands": the baseline's placed finish against today's placed finish, same fallback.                                                                                           | No — same rule.                                                                                                                                                        |
| **#405 (c)** | Earned Value planned value phased on **placed** dates.                                                                                                                                                      | **Yes.** It changes PV, SPI and every EV figure on a placed plan — write a short spec (feature-analyst, Opus) and amend ADR-0042/0044 **before** a builder touches it. |
| **#407**     | Map the body parser's `PayloadTooLarge` to **413** with the envelope, and raise the body limit on **authenticated** routes only (sized for 2,000 items, ~256 KB); keep 64 KB on the unauthenticated routes. | No, but **security-reviewer is mandatory** before merge.                                                                                                               |

Then **#334 M2** (render isolation), from its approved plan in `docs/specs/activities-panel-scale/`.
**M3** (windowing) needs an ADR and CQ-B, a product-owner decision, before it starts.

## Model switch points

1. Start the next session on **Opus**: write the #405 (c) spec and ADR amendment, and brief the
   builders.
2. Once the builders are briefed, switch to **Sonnet** (`/model`) for build, reviews, sweep and
   release.
3. Switch back to **Opus** for #334 M3's ADR or an unexpected gate failure.

## Environment notes a new session would otherwise rediscover

- **The container's `/tmp` fills with per-run build caches** (random 20-character directories
  holding `client/`). At 93% disk, Chromium failed with `net::ERR_INSUFFICIENT_RESOURCES` and four
  journeys rendered blank pages. Check `df -h /` before a sweep, and clear those directories if
  it is above ~85%.
- **`e2e-library` fails locally** on a strict-mode `getByText('Crew A')` (the assignment row and
  the picker's shown value), and passes in CI on the same head. It is an environment difference,
  not a regression.
- Agents must not run Playwright or `scripts/e2e-local.sh`: they share one database and fixed
  ports. The orchestrator runs `scripts/e2e-sweep.sh` centrally.
- Release: merge the Version Packages PR despite its `action_required` checks (`CLAUDE.md` §11),
  then confirm the `api-v*` / `web-v*` tags and the Release run's two publish jobs.
