# M6-T0 — the critical-path-test route, measured

> The backend-performance review made this task a conditional blocker and CQ-1 = (b) fired the
> condition: the route runs `computeSchedule` **twice** per call (a control pass and a perturbed
> pass), so its cost is plausibly at or above a full recalculate and **must not** borrow
> `FLOAT_PATHS_THROTTLE` (sized for ONE pass at 540 activities). `docs/TECH_DEBT.md` #74 records
> recalculate's own 2,000-activity cost as unmeasured, so there is nothing safe to copy.

## The falsification condition, written before the measurement ran

The throttle is **derived by formula, not judged after the fact**. Per authenticated IP, the
route's worst-case compute time may claim at most **20 % of a 60-second window** — the same
occupancy reasoning `FLOAT_PATHS_THROTTLE`'s docblock argues in prose, made arithmetic:

```
limit = clamp( floor(12_000 ms / p95_2000ms), 3, 20 )
```

- `p95_2000` is the two-pass cost at 2,000 activities (the largest catalogue scale).
- The **floor of 3** keeps the panel usable even if the measurement comes back slow — a planner
  pressing the button, re-pressing after an edit, and re-pressing once more is three calls.
- The **cap of 20** means the number can never exceed float-paths' limit, because a two-pass route
  being allowed MORE runs per minute than the one-pass route would be self-evidently wrong.

**Falsified if:** `p95_2000` exceeds **4,000 ms** — then the formula yields the floor and the
floor is a lie (three six-second calls is not a usable button), so the design goes back to the
product owner with the number rather than shipping behind any throttle.

Secondary condition: the scale-500 **whole-endpoint** p95 must come in **under 2× the recalculate
p95 on the same plan** (two passes should cost about two passes — materially more means the route
is doing work the design does not describe, and the overage is investigated before shipping).

## Method

Two instruments, because the two scales answer different questions and the environment recycles
mid-seed (twice recorded in `m0-measurement.md`):

1. **Whole-endpoint HTTP p95 at `plan:scale-500`** — `scripts/measure-critical-path-test.mjs`
   (adapted from `measure-float-paths.mjs`: same seeded-plan approach, same warm-up, same
   nearest-rank percentiles, recalculate measured alongside on the same plan), against the REST
   catalogue seed. This carries the full route cost: auth, loaders, graph build, two computes,
   serialisation.
2. **Engine-level two-pass cost at 2,000 activities** — the same synthetic SQL-built plan method
   the M5 gate pass recorded for the loader measurement, driven through the real
   `GET …/schedule/health-check/critical-path-test` route where session/tenancy permit, else
   through a node script invoking `computeSchedule` twice on the built graph. The engine dominates
   this route's cost (the M0-T2 loaders measured sub-1 ms each at this scale), so the two-pass
   engine figure bounds the route figure to within loader + serialisation noise.

## Results (2026-08-28, `scripts/measure-critical-path-test.mjs`, n=20 after one warm-up)

| Measurement                                        | Result                                                  |
| -------------------------------------------------- | ------------------------------------------------------- |
| scale-500 route p95 (540 activities / 800 links)   | **260.5 ms** (p50 209.4)                                |
| scale-500 recalculate p95 (same plan, same script) | 220.7 ms — the route is **1.18×** a recalculate         |
| 2,000-activity route p95 (whole endpoint, HTTP)    | **846.5 ms** (p50 804.0; recalculate 694.3 → **1.22×**) |
| Derived limit (formula above)                      | `clamp(floor(12_000 / 846.5), 3, 20)` = **14 / 60 s**   |

Neither falsification condition fired: 846.5 ms is far below the 4,000 ms line, and both scales
hold the route under 2× a recalculate — two passes cost about two passes, minus the write and lock
a recalculate also pays. `CRITICAL_PATH_TEST_THROTTLE = 14/60 s` ships with this table cited.
**The "indicative" caveat below applies to THESE headline numbers with equal force, not only to
the recalculate side-figure** (the M6 backend-performance review's point): a chain-heavy synthetic
graph exercises no WBS summary-rollup walk and a thinner edge ratio than a real programme, and a
CI-class container is not a production host. The engine's passes are O(V+E) regardless of shape,
and the derived limit carries ~4.7× headroom to the falsification line, which is what the number
is for.

**Method notes.** The scale-500 plan is the REST catalogue seed (`plan:scale-500`, 540 activities /
800 links). The 2,000-activity plan is a synthetic SQL build INSIDE the measurement org (chain +
20 % skip links, mixed FS/SS/FF with lead/lag spread) — the M5 loader-measurement method one step
further: because the plan lives in a real org with a real member, the number is the **whole real
route over HTTP** (auth, loaders, graph build, both computes, serialisation), not an engine-only
proxy, so instrument 2 in the method section above was not needed. The throttle was lifted for the
measurement run only (the throttle is not part of the latency being measured) and set to the
derived value before commit.

**A side-measurement worth recording:** `docs/TECH_DEBT.md` #74 calls recalculate's own
2,000-activity cost unmeasured — this run put it at **694.3 ms p95** on this host and this
synthetic shape. Indicative only (a chain-heavy synthetic graph, a CI-class container), but it is
the first number that row has ever had.
