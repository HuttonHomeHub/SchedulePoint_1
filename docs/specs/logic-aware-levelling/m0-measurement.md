# M0 measurement record: logic-aware levelling

Recorded 2026-10-01 against the code at `f9b3119` (the spec's own commit, so the engine is the one
`apply-levelled-dates` left), before any behaviour change. Node 22.22.0, 4 vCPU Intel Xeon @ 2.10 GHz,
16 GB, a shared sandbox and not a planner's machine: read ratios and shapes, not milliseconds.

**Result.** C7, C8 and C10 hold. **C10 is TRUE, so Gate D's argument stands and there was no stop.**
C11 and C17 were wrong or over-stated and are corrected in the spec's §0; two new claims (C20, C21) are
added there. CQ-3's gap count is in T1.5. Item T1.3's database half is **owed to the orchestrator**
(`scripts/e2e-local.sh api`).

**How the figures were produced.** Every figure carries its command. "Scratch" means a vitest spec or
module written under `apps/api/src/modules/schedule/{engine,conformance}/` and **deleted before the
commit**; the committed evidence is `engine/level.links.parity.spec.ts`,
`conformance/scenarios.levelling-links.spec.ts` and `test/levelled-finish.e2e-spec.ts`, whose plain-`it`
preconditions re-assert their fixtures' numbers on every run. The **reference Pass C** is a scratch
copy of `compute.ts` (exposing Pass 2's pass-on instants in memory, spec §4.6) and `level.ts` (plus
Pass C, spec §4.6 steps 1 to 5, D-2, D-3, D-8), swapped over the real files in the working tree for a
run and restored with `git checkout -- compute.ts level.ts`. It is **never committed**.

Common to every scratch command below: run from `apps/api`.

## T1.1 and T1.2: the scale plan, and how many ghosts break their links (SC-1, SC-2, SC-5 before)

`scaleSpec({ activities: 2000 })`: 2,160 activities, 3,200 links, one `SCALE_CREW`.

**Delayed, dropped, rows, remaining, solves, and the recalculation and preview cost.** The apply-levelled-
dates harness, unchanged:

```text
pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-levelling-application.mts \
  --silent=false --disable-console-intercept
```

| Variant                        | Delayed | Rows | Dropped (`leftToLogic`) | `conflictingPlaced` | `remainingAfterApply` | Solves |
| ------------------------------ | ------- | ---- | ----------------------- | ------------------- | --------------------- | ------ |
| capacity 8 (as seeded)         | 10      | 2    | **8**                   | 0                   | 0                     | 3      |
| capacity 2 (forced contention) | 236     | 18   | **218**                 | 0                   | **236**               | 3      |

Identical to `apply-levelled-dates/m0-measurement.md` (10 / 8 / 0 and 236 / 218 / 236), so C4 and C5 hold.

| Variant    | Recalculate p50 / p95 | Preview p50 / p95  | Ratio p50 / p95 |
| ---------- | --------------------- | ------------------ | --------------- |
| capacity 8 | 298.7 / 328.9 ms      | 899.4 / 994.3 ms   | 3.01x / 3.02x   |
| capacity 2 | 315.6 / 355.1 ms      | 965.1 / 1,025.4 ms | 3.06x / 2.89x   |

n = 50 after one untimed warm-up, nearest-rank percentiles, both routes timed alternately in one run. This
machine is about 30% slower than the 2026-09-30 sitting (229.5 / 330.0 ms at capacity 8), which is why SC-5
is stated as a ratio to **this** run: M2 must re-take the baseline on the machine it measures on. **SC-5's
"before" is 298.7 ms p50 / 328.9 ms p95 (capacity 8) and 315.6 / 355.1 ms (capacity 2)**; the bound is
1.5x of the figure taken in the same sitting as the "after".

**Delayed activities with a successor, and links the overlay breaks (SC-1's "before").** Scratch spec
`zz-scratch-m0.spec.ts`, run as `pnpm exec vitest run src/modules/schedule/engine/zz-scratch-m0.spec.ts
--silent=false --disable-console-intercept`, on the real engine (`anchor: 'PLACED'`). For every link
except those with an LOE end, a mandatory or started successor or a summary, a link is **broken** when the
successor's levelled start (overlay, else drawn) is before `forwardLowerBound` of its predecessor's
levelled position, rolled to working time on the successor's calendar.

| Plan                            | Delayed | Delayed with a successor | Links broken by the overlay | Distinct successors broken | Broken with no levelling |
| ------------------------------- | ------- | ------------------------ | --------------------------- | -------------------------- | ------------------------ |
| scale-2000, capacity 8          | 10      | **10 of 10**             | **10**                      | 10                         | 0                        |
| scale-2000, capacity 2          | 236     | **236 of 236**           | **187**                     | 166                        | 0                        |
| `capability-levelling`          | 2       | 2 of 2                   | 2 (`V2 → V4`, `V3 → V4`)    | 1 (`V4`)                   | 0                        |
| `capability-levelling-placed`   | 1       | 1 of 1                   | 0                           | 0                          | 0                        |
| `capability-levelling-part-day` | 0       | 0                        | 0                           | 0                          | 0                        |

So **SC-1's "before" is 10 and 187 broken links on the scale plan** and 2 on the seeded plan. Every delayed
activity on the scale plan has a successor, which is the whole defect. The part-day plan is degenerate in
this harness: `specToEngineInput` rounds every duration to whole days (`TECH_DEBT` #78), so a 240-minute
lift becomes zero days; it proves nothing about levelling and is listed only because the plan asked for
"every seeded levelling plan". Pairwise: 14 of the 63 pairwise cases level (`levelResources` on) and
none has a delayed activity (4 activities, no contention), so none can move.

## T1.3: C7, the two levelled finishes: TRUE at the formula level and at the database

**Owed: the orchestrator runs `scripts/e2e-local.sh api`.** I may not run it (shared database and ports).
What was established without it, and how it differs from the real thing:

- **Read.** `GET …/schedule/summary` is `MAX(COALESCE(leveled_finish, early_finish))` over every active
  activity, null unless any `leveled_finish` is non-null (`schedule.repository.ts:419-426`).
  `writeResults` sends `r.leveledFinish ?? null` for every result (`:894`), so a non-participant's
  `leveled_finish` is null and the SQL counts it at its **early** finish.
- **Evaluated, not run.** The scratch spec above applies that formula in JavaScript to the engine's own
  results, next to the engine's `summary.leveledProjectFinish` and the placed project finish:

| Plan                                                               | Engine `leveledProjectFinish` | The SQL's formula over the same results | "Finish" (placed)    |
| ------------------------------------------------------------------ | ----------------------------- | --------------------------------------- | -------------------- |
| C7 fixture: `X`, `Y` on a crane, `Z` placed on 20 Jan, no resource | 2026-01-21                    | **2026-01-06**                          | 2026-01-21           |
| `plan:capability-levelling-placed`                                 | 2026-04-01                    | **2026-03-25**                          | 2026-04-01           |
| `plan:capability-levelling`                                        | 2026-03-16                    | 2026-03-16                              | 2026-03-13           |
| S2 fixture (`Q`, `P`, `C`)                                         | 2026-01-10                    | 2026-01-10 (by hand, not run)           | 2026-01-09 (by hand) |

C7 is therefore true: the two figures differ on a plan with a hand-placed non-participant last bar, and on
the **shipped** placed plan the strip's "Levelled finish" would read 25 Mar against a "Finish" of 1 Apr, so
SC-3's equality fails today there and holds on the two unplaced plans. The formula also counts LOE and
summary activities, which the engine excludes; no seeded plan separates them.

- **Committed, unrun.** `test/levelled-finish.e2e-spec.ts` builds the C7 fixture through the public REST
  API: a plain-`it` precondition (stored `Y.leveledFinish` 2026-01-06, response `projectFinish` and
  `leveledProjectFinish` both 2026-01-21) and an `it.fails` (summary read equals the response and is not
  before `projectFinish`). **It has not been run**: lint and typecheck pass, nothing more. The orchestrator
  should run it and, if the precondition fails, report which figure differs before anything is changed.
  If the `it.fails` unexpectedly passes, C7 is false at the database level and M1 is not needed.
- **Database read, taken (2026-10-01).** The orchestrator ran `scripts/e2e-local.sh api` at `31c54d3`: 77
  files, 815 tests passed, **1 expected fail**. `test/levelled-finish.e2e-spec.ts`'s precondition `it`
  passed and its `it.fails` stayed red, so **C7 holds at the database level**: the summary read disagrees
  with the recalculation response on the C7 fixture. M1 is therefore needed, and it turns that `it.fails`
  into a plain `it`.

## T1.4: C8, the seeded plan already shows #427: TRUE

Same scratch spec, `plan:capability-levelling` (`levellingPlan()`), five-day week, engine as shipped:

| Activity | Drawn (= early)         | Levelled            | Delay (min) |
| -------- | ----------------------- | ------------------- | ----------- |
| `V1`     | 2026-03-04 to 03-06     | 2026-03-04 to 03-06 | 0           |
| `V2`     | 2026-03-04 to 03-06     | 2026-03-09 to 03-11 | 4,320       |
| `V3`     | 2026-03-04 to 03-06     | 2026-03-12 to 03-16 | 8,640       |
| `V4`     | **2026-03-09 to 03-13** | **none**            | none        |

The strip's figure (engine and SQL formula alike) is **2026-03-16**. Under the reference `V4` is levelled
to **2026-03-17 to 03-23** and the figure becomes 2026-03-23: five working days later, so today's figure is
five working days early and `V4` has no ghost. The spec's C8, including "5-day default" and "V3 levels to
12-16 Mar", is confirmed.

## T1.5: CQ-3, how often does Pass C leave a gap?

Measured with the reference (`LAL_PRINT=1`, scratch). **Definitions**, because the plan did not fix them:
a _pushed participant_ is a levellable participant Pass C re-placed later; a _backfillable_ participant is
one whose earliest feasible start, searched again in the final profile from `max(anchor, link floor)`, is
earlier than where it sits; a re-placed participant _leaves a gap_ when a backfillable one's earlier slot
overlaps a window it vacated on a shared resource. Before Pass C runs, backfillable is **0** in every plan
(Pass B never leaves one, as expected), so every gap counted is Pass C's.

| Plan                            | Levellable participants | Pushed participants | Pushed non-participants | Backfillable | **Re-placed participants leaving a gap** |
| ------------------------------- | ----------------------- | ------------------- | ----------------------- | ------------ | ---------------------------------------- |
| scale-2000, capacity 8          | 591                     | 315                 | 566                     | 1            | **2**                                    |
| scale-2000, capacity 2          | 591                     | 571                 | 1,138                   | 62           | **143**                                  |
| `capability-levelling`          | 3                       | 0                   | 1 (`V4`)                | 0            | 0                                        |
| `capability-levelling-placed`   | 3                       | 0                   | 0                       | 0            | 0                                        |
| `capability-levelling-part-day` | 2                       | 0                   | 0                       | 0            | 0                                        |
| S10 (the P6 torture fixture)    | 22                      | 3                   | 12                      | 0            | 0                                        |
| 14 pairwise cases, levelling on | 0                       | 0                   | 0                       | 0            | 0                                        |

**The CQ-3 gap count is 2 of 315 (0.6%) at the seeded capacity and 143 of 571 (25%) under heavy
contention, where 62 participants (10.5%) could start earlier.** The decision stays the product owner's:
(a) is safe on every seeded plan and on the scale plan as seeded, and the loss is concentrated where the
plan is already badly over-allocated. Also measured, and not asked for: under the reference the scale plan's
delayed count goes from 10 to 883 at capacity 8 (1,238 activities carry an overlay, against 672), and from
236 to 1,716 at capacity 2, with `leveledProjectFinish` moving from 2037-05-05 to 2037-06-10 and to
2045-11-02. That is what "the knock-on" costs on a chain-heavy plan; M2's journey and changeset should
say so. The reference's SC-1 count on those plans is **0 broken links** at both capacities.

## T3: the wrong-implementation runs (ADR-0110)

The committed cases, with `it.fails` turned into `it` in a scratch copy of each file
(`zz-scratch-flip.spec.ts`, `zz-scratch-flip-s10.spec.ts`), were run with `CI=1` (so a new snapshot is a
failure and not a write) against the reference and, in turn, four deliberately wrong versions of it,
selected by an environment variable the reference read. Command, per variant:

```text
LAL_VARIANT=<variant> CI=1 pnpm exec vitest run --reporter=verbose \
  src/modules/schedule/engine/zz-scratch-flip.spec.ts \
  src/modules/schedule/conformance/zz-scratch-flip-s10.spec.ts
```

**Under the reference**: every flipped case is green (the chain golden, S10's two, SC-1 over all five
shapes, the LOE case, the mixed-calendar cap case) and **both Gate D guards are green**. The only reds
are the five snapshots (which move, as the spec says they will: in a scratch copy a new snapshot file is
not written under `CI=1`) and the plain-`it` preconditions (which assert today's engine, by design).

| Wrong implementation                                            | Result | The assertion that fails                                                                                                              |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| (i) floors from the early dates, not the pass-on                | fails  | Gate D: "a hand-placed predecessor that levelling leaves where it is does not push a follower already earlier than its links"         |
| (ii) push without the `floorL > floorU` guard                   | fails  | the same Gate D case, **and** "a hand-placed bar earlier than its links is not repaired when no predecessor moved"                    |
| (iii) cap clamped to the anchor, not `max(anchor, floor)`       | fails  | "the within-float cap never puts a follower before its link floor > keeps C finishing no earlier than B" (the mixed-calendar fixture) |
| (iv) an LOE predecessor that pushes (counted in the link floor) | fails  | "an LOE predecessor pushes nothing, but a real predecessor still does > levels D to 3 January, behind C"                              |

Each wrong version fails exactly the case(s) named and no other flipped case. **None of the four is caught
by the plan's five shapes or SC-1 on their own** (they move under any Pass C), which is C21: the two Gate
D guards, the LOE case and the mixed-calendar case were added for this reason, and the first two are plain
`it` because they must hold both today and after M2.

**Finding: (iii) cannot be caught on one calendar.** A random search (scratch, seed 12345, 60,000 plans per
run, 3 to 7 activities, FS/SS/FF/SF with lags, one or two capacity-1 resources, priorities, hand placements,
LOE, FNLT constraints, `levelWithinFloatOnly` on 70%) compared the reference with each variant's overlay
dates and plan-frame offsets:

| Run (generator)                                        | Cap fired | Clamp fired | Plans where (iii) differs                                                           | (i)   | (ii)  | (iv) |
| ------------------------------------------------------ | --------- | ----------- | ----------------------------------------------------------------------------------- | ----- | ----- | ---- |
| plan calendar 24/7, no constraints, `within` 50%       | n/a       | n/a         | **0**                                                                               | 1,996 | 5,400 | 67   |
| plan 24/7 or Mon-Fri, FNLT, `within` 70%               | 1,392     | 130         | **0** (all 130 on Mon-Fri plans, where both clamps give the same dates and offsets) | 2,561 | 8,551 | 59   |
| plan 24/7 only, FNLT, `within` 70%                     | 1,476     | **0**       | **0**                                                                               | 2,107 | 5,812 | 74   |
| as the second, plus 35% of tasks on their own calendar | 1,550     | 244         | **108**                                                                             | 2,970 | 9,991 | 54   |

So the clamp is **unreachable on a single calendar** (a capped predecessor finishes by its late finish, so
the follower's floor never exceeds its late start) and reachable only where the plan's and an activity's
calendars differ. The committed fixture is the smallest such case the search found (plan Mon-Fri; both
activities on a 24/7 calendar of their own; `B` FF `C`; `C` finish-no-later-than 9 Jan; `within` on). Under
the reference `C` is levelled to 3 to 5 Jan and under (iii) to 1 to 3 Jan, finishing two days before the
activity it must finish with. D-8 stands, and M2's reviewer should know it is defensive on most plans.

**Confirmed under the reference, unedited (C10, SC-6):**

```text
CI=1 pnpm exec vitest run --reporter=verbose src/modules/schedule/engine/level.parity.spec.ts \
  src/modules/schedule/conformance/scenarios.spec.ts src/modules/schedule/conformance/goldens.spec.ts
```

3 files, 65 tests, all pass: **the eight `level.parity.spec.ts` snapshots (no snapshot file touched), all
of S10's existing assertions, and the existing levelling golden**. C10 is TRUE.

**Not asked for, and not a reason to stop.** The whole `src/modules/schedule` suite under the reference
(`CI=1 pnpm exec vitest run src/modules/schedule`, excluding the new files): 1,210 pass and 13 fail. Eleven
are `apply-levelling.spec.ts` (P3, P4, P9, P11, P12, P14), which is spec C20. The other two were the
`level.spec.ts` call-count gates ("a fragmented profile costs per interval", "a lagged profile does not
multiply the cost by the lag"), which failed **because of the reference's own gap-counting
instrumentation**: with it switched off (`LAL_NOSTATS=1`) all 31 `level.spec.ts` tests pass. That is a
property of the scratch code and says nothing about Pass C's cost, which M2 measures.

## What changes in the spec

Amended in `feature-spec.md` §0 and `implementation-plan.md` in the same commit: C7, C8, C10 (now measured
or verified); C11 (corrected: the delayed crane activity is `A6100`; `A7740` is not behind a delayed
predecessor today); C17 (the clamp's reach); new C20 (six apply cases move, and a milestone follower
must be decided first) and C21 (the five shapes catch none of the wrong implementations alone); §4.5's S10
bullet; M0-T2's S10 line; M2-T4's revised-cases list; and an "M0 outcome" paragraph.
