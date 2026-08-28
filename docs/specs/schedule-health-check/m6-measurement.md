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

## Results

_(filled after the run — the condition above is committed first)_

| Measurement                                        | Result |
| -------------------------------------------------- | ------ |
| scale-500 route p95                                | TBD    |
| scale-500 recalculate p95 (same plan, same script) | TBD    |
| 2,000-activity two-pass p95                        | TBD    |
| Derived limit (formula above)                      | TBD    |
