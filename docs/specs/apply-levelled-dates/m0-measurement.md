# M0 measurement record: apply levelled dates

Recorded 2026-09-30 against the code at `0e313a0`, before any behaviour change. Every figure below was
produced by running the engine (`computeSchedule` then `levelSchedule`, `anchor: 'PLACED'`) in a scratch
vitest spec, which was deleted afterwards; the committed evidence is `engine/apply-levelling.spec.ts`,
whose plain-`it` preconditions re-assert the fixtures' numbers on every run.

**Result: both premises are TRUE. T0.2 was built.** The spec's own P6 example did not discriminate and
was replaced (T0.1, "Findings that change the cases").

## T0.1 — A3: a levelled start can fall part-way through a day: TRUE

Plan calendar Mon-Fri 08:00-16:00 (480 min/day), data date Monday 2026-01-05. `X` is a 4-hour lift
(240 min, priority 1) and `Y` a 1-day lift (480 min, priority 2), both on a capacity-1 crane, no logic.

| Reading                                         | Value                                                  |
| ----------------------------------------------- | ------------------------------------------------------ |
| `Y` `leveledStartOffset` (plan working minutes) | 240: 12:00 on Monday                                   |
| `Y` `leveledStart` (the date the ghost reports) | `2026-01-05`                                           |
| `Y` `levelingDelay`                             | 240 minutes                                            |
| `leveledActivityCount`                          | 1                                                      |
| Date-copy apply: `visualStart = 2026-01-05`     | drawn 2026-01-05, `levelingDelay` **240**, count **1** |
| Next-day apply: `visualStart = 2026-01-06`      | drawn 2026-01-06, `levelingDelay` **0**, count **0**   |

Copying the ghost's date puts the bar at 08:00 on Monday, four hours before the crane is free, and the
clash comes straight back. Only the following day clears it, which is what CQ-4 (a) rounds to.

**Seed catalogue (T0.1 step 3).** `grep -rn levelling apps/seed-cli/src/capabilities/` finds
`levellingPlan()` and `levellingPlacedPlan()` in `resources.ts`. Both use whole-day durations only
(`2 * DAY`, `3 * DAY`) on a five-day-week calendar, so **no seed plan has a part-day levelled start**.
T3.3 (`plan:capability-levelling-part-day`) is therefore needed, as the plan allows for.

## T0.1 — A5: levelling does not push successors: TRUE

24/7 plan calendar (1 day = 1440 min), data date 2026-01-05. `Q` (crane, 3 d, priority 1), `P` (crane,
3 d, priority 2), `S` (2 d) with `P` FS `S`. Offsets are plan working minutes from the data date.

| Fixture                                    | `P` levelled start / finish | `S` levelled start / finish | `S` delay |
| ------------------------------------------ | --------------------------- | --------------------------- | --------- |
| `S` on a pump nobody else wants            | 4320 / 8640 (3 d to 6 d)    | 4320 / 7200                 | 0         |
| `S` on a pump behind `R` (4 d, priority 1) | 4320 / 8640                 | **5760** / 8640             | 1440      |

In both, `S` starts in the overlay **before `P` finishes** (4320 and 5760 against 8640): the overlay is
logically impossible, which is A5. Applying every ghost of the second fixture (`P` to `2026-01-08`, `S`
to `2026-01-09`) solves to `S`: `visualConflict: true`, `visualConflictReason: 'EARLIER_THAN_LOGIC'`,
drawn `2026-01-09`, while `P` now finishes on the 11th. So a blind apply does plant a logic conflict.

## T0.1 — findings that change the cases

1. **P6 as written does not discriminate.** The spec's example is an own calendar whose day starts at
   06:00 against the plan's 08:00, with the wrong implementation "reconstruct the instant from
   `leveledStartOffset` on the plan calendar". A grid search ran 2 plan calendars (08:00-16:00; split
   08:00-12:00/13:00-17:00) x 4 own calendars (06:00-14:00; 10:00-18:00; 06:00-14:00 Mon-Sat; 24 h) x 7
   durations for the crane-holder `X` x 2 for `Y` = 112 fixtures, of which **76** delayed `Y`. It ran
   twice over them, with `levelWithinFloatOnly` off and then on (with a 6-day free-float activity so the
   cap could bite). In **both runs, in all 76, the date reconstructed from the plan-frame offset equalled
   the date an oracle found** (the earliest date on which writing `visualStart` leaves `levelingDelay`
   0). The reason is structural: a blackout ends at a plan-calendar boundary, `advanceWorking` returns
   the **end boundary** of a working minute, and rounding forward on the own calendar from the boundary
   and from its roll-forward gives the same earliest date. The lossy path `level.ts:78-83` describes
   exists, but not at the date the apply needs. P6 therefore asserts the other natural mistake,
   **rounding on the plan's calendar instead of the activity's own**: plan 08:00-16:00, own calendar
   10:00-18:00, the crane held for 600 plan-minutes (until 10:00 on Tuesday). `Y` is freed at 10:00
   Tuesday, exactly its own Tuesday start, so the answer is `2026-01-06`; rounding on the plan's
   calendar (first minute 08:00) says Wednesday. The same grid, re-run with that wrong rule, found it
   differs from the oracle in 4 of the 76 fixtures, all of this shape.
2. **The smallest date whose placement is at or after the instant can be a non-working day.** On the
   grid, with the crane held through Friday and `Y` on a Monday-Friday calendar, the oracle's earliest
   clearing date was Saturday 2026-01-10, which Pass 2 rolls forward to Monday. The spec's §4.6 step 3
   says "the smallest calendar date D such that the placement instant of D is at or after the levelled
   instant", which yields that Saturday; CQ-4 (a) says "the next working day". The two agree on what
   is drawn and disagree on what is stored. **A decision for M1, not made here**: whether the row
   carries the Saturday or the Monday (P1-P7 use working days only, so none of them fixes it).
   **Decided in M1 (product owner's CQ-4 (a), "the next working day"): the row carries the Monday.**
   The stored date is the earliest working date whose own placement is at or after the levelled
   instant, so nothing rests on Pass 2's roll-forward; case P8 pins it and is red (Saturday) against
   the plain "smallest date" rule.
3. **Copying the ghost date is wrong in both directions, not only early.** On that same Saturday
   fixture the ghost date is Monday 2026-01-12 against an earliest clearing date of the 10th: a copy
   lands a bar later than it needs to be as well as, in P2's case, earlier.

## T0.2 — the wrong-implementation runs (ADR-0110)

`apply-levelling.spec.ts` was run with `it.fails` turned into `it` and the throwing stub replaced by, in
turn, a reference implementation and four deliberately wrong ones (scratch files, deleted). The
reference implementation (candidates by delay, target from the levelled instant on the activity's own
calendar, a tentative solve, drop the `EARLIER_THAN_LOGIC` ones, re-solve) passed **all 13** cases, so
no case is unsatisfiable. The wrong ones, and the assertion that failed:

| Case | Wrong implementation                               | Result | The assertion that failed, and why                                                          |
| ---- | -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| P2   | date copy (`visualStart = leveledStart`)           | fails  | `delayedIdsOf(settle(rows))` expected `[]`, received `['Y']`: the 4-hour clash is back      |
| P3   | write every ghost (`leveledStart !== drawn start`) | fails  | `conflictsOf(settle(rows))` expected `[]`, received `['S']`: `S` placed before `P` finishes |
| P3   | date copy (every delayed participant)              | fails  | the same assertion, the same `['S']`                                                        |
| P5   | write every participant                            | fails  | `rows.map(activityId)` expected `['B']`, received `['A', 'B', 'C']`                         |
| P6   | round on the plan's calendar                       | fails  | `rows` expected `visualStart: '2026-01-06'`, received `'2026-01-07'`: a day late            |

Also observed, not required by the plan: date copy also fails P4 (it writes `S`, which a hand-placed
follower must keep) and P6's date copy passes (its ghost date is already Tuesday); "write every
participant" fails P1, P4, P6 and P7 as well. Every case's precondition `it` is a plain test that passes
today, and each asserts the fixture separates right from wrong: P2 (ghost date leaves delay 240,
Tuesday leaves 0), P3 (every ghost gives conflicts `['S']`, `P` alone gives none), P6 (Monday clashes,
Tuesday and Wednesday clear).

## T0.3 — side rows

Filed as `docs/TECH_DEBT.md` **#426** (S1) and **#427** (S2). 424 and 425 are reserved by unmerged
follow-up work; the highest number in the register was 423.

**S1 measured.** On P2's fixture above the plan has `leveledActivityCount` 1 and `Y`'s
`leveledStart` equals its `visualEffectiveStart` (both `2026-01-05`), so the lens's draw predicate
(`apps/web/src/features/tsld/render/lenses.ts:470`) draws no ghost for an activity the count includes.

**S2 measured.** `Q` (crane, 3 d, priority 1), `P` (crane, 3 d, priority 2), `C` (2 d, no assignment),
`P` FS `C`, 24/7 calendar. `leveledProjectFinish` is `2026-01-10` (`P`'s levelled finish, offset 8640)
while `C` has no overlay and keeps its network finish `2026-01-09`. `P` finishes at day 6, so `C` would
really finish two days later, `2026-01-12` (arithmetic from `P`'s levelled finish, not a third run).
The summary's "Levelled finish" is 2 days early on this plan.
