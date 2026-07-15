# ADR-0023: CPM scheduling date convention (continuous-internal / inclusive-display)

- **Status:** Accepted (amended by ADR-0036)
- **Date:** 2026-07-10
- **Deciders:** James Ewbank (with Claude Code)

> **Amended by [ADR-0036](0036-hour-granular-calendars-and-durations.md) (M1):** the continuous-internal
> unit is now the working-**minute** (was the working-day); the inclusive-display convention is unchanged.

## Context

The CPM engine (M6, [`docs/specs/cpm-engine.md`](../specs/cpm-engine.md)) computes
each activity's early/late start and finish, its total float, and whether it is on
the critical path, by a forward then backward topological pass over the plan's
activity/dependency graph (M3 nodes, M4 edges; the DAG invariant is ADR-0021).

Scheduling day-math is a notorious source of **off-by-one** bugs, and the brief
names "CPM engine bugs erode planner trust" a **top product risk**
(PROJECT_BRIEF §17). Two representations pull in opposite directions:

- **Relationship arithmetic** (FS/SS/FF/SF with signed lag, taking the max of
  incoming bounds and the min of outgoing bounds) is cleanest when a finish is
  `start + duration` with no `−1` corrections sprinkled through it. That wants a
  **continuous** number line where a 3-day task starting at 0 finishes at 3.
- **What a planner reads** is an **inclusive** calendar date: a 3-day task
  starting Mon 1 Jan finishes Wed **3** Jan (it occupies the 1st, 2nd and 3rd),
  not the 4th. And a **zero-duration milestone** has one date — its start day _is_
  its finish day.

Mixing the two — doing the `−1` inside the pass — is exactly where off-by-one and
milestone bugs breed. We also need a single, documented answer to: what is the
**data date** (schedule origin)? how do **working days** relate to calendar days
before M5 (Calendars) exists? and where do **constraints** clamp?

## Decision

We will separate the two representations with a **continuous-internal /
inclusive-display** convention, and compute in the former, persist in the latter.

1. **Data date.** The schedule origin is `DD = Plan.plannedStart` (offset 0). A
   plan with no `plannedStart` cannot be scheduled — the engine is never asked to
   (the endpoint returns `422 PLAN_START_REQUIRED`; see ADR-0022). This slice is
   **planned-only**: `actualStart`/`actualFinish`/`percentComplete` do **not**
   seed the pass (progress-aware forecasting is a documented later slice).

2. **Continuous internal offsets.** The engine works in integer **working-day
   offsets** from `DD`. For activity `a` with duration `Dₐ` (working days;
   milestones are `0`): `earlyFinishOffset = earlyStartOffset + Dₐ`, and likewise
   `lateStartOffset = lateFinishOffset − Dₐ`. No `−1` appears anywhere in the
   pass. The relationship bounds are:

   | Type | Forward — bound on the successor start | Backward — bound on the predecessor finish |
   | ---- | -------------------------------------- | ------------------------------------------ |
   | FS   | `ES_s ≥ EF_p + L`                      | `LF_p ≤ LS_s − L`                          |
   | SS   | `ES_s ≥ ES_p + L`                      | `LF_p ≤ (LS_s − L) + D_p`                  |
   | FF   | `ES_s ≥ (EF_p + L) − D_s`              | `LF_p ≤ LF_s − L`                          |
   | SF   | `ES_s ≥ (ES_p + L) − D_s`              | `LF_p ≤ (LF_s − L) + D_p`                  |

   `ES_s = max(0, all incoming bounds)`; project finish `T = maxₐ EF_a`;
   `LF_p = min(T, all outgoing bounds)`; open ends (no successors) seed `LF = T`.

3. **Total float & criticality.** `TF_a = LS_a − ES_a` (`= LF_a − EF_a`) in
   working days, and it **may be negative** when a constraint cannot be satisfied
   (surfaced as negative float + `is_critical`, never an error).
   `is_critical = TF_a ≤ 0`; `is_near_critical = 0 < TF_a ≤
NEAR_CRITICAL_THRESHOLD_WORKING_DAYS` (a fixed engine constant, **5** in this
   slice; a per-plan setting is a trivial additive follow-up).

4. **Inclusive display dates.** Only when persisting do we convert offsets to
   calendar days via the `WorkingDayCalendar` port:
   - `early_start = DD + ES`
   - `early_finish = D = 0 ? early_start : DD + (EF − 1)`
   - `late_start = DD + LS`
   - `late_finish = D = 0 ? late_start : DD + (LF − 1)`

   The `D = 0` branch is the **milestone rule**: a zero-duration node's finish
   date equals its start date. The **project finish date** is the latest inclusive
   `early_finish` across the plan — so a finish milestone pinned at offset `T`
   reads one calendar day later than a task ending at `T` (whose inclusive last
   day is `T − 1`). This keeps the engine's summary identical to the C1
   `max(early_finish)` aggregate.

5. **Working days vs calendar days — the calendar seam.** Offsets are **working
   days**. The engine never does calendar arithmetic itself; it delegates to the
   `WorkingDayCalendar` port (`addWorkingDays`, `workingDaysBetween`). In M6 the
   only implementation is **all-days-work** (every calendar day is a working day,
   so a working-day offset maps 1:1 onto calendar days). M5 (Calendars) supplies a
   real calendar (weekends, holidays, per-activity calendars) behind the **same
   port with no change to the engine**.

6. **Constraints (added in Task A3).** `constraintDate` is converted to an offset
   via the port and clamps the pass: **forward** — `SNET` (`ES ≥ c`), `FNET`
   (`EF ≥ c ⇒ ES ≥ c − D`), `MSO` (`ES = c`), `MFO` (`EF = c ⇒ ES = c − D`);
   **backward** — `SNLT` (`LS ≤ c ⇒ LF ≤ c + D`), `FNLT` (`LF ≤ c`), `MSO`
   (`LS = c ⇒ LF = c + D`), `MFO` (`LF = c`). `MANDATORY_START` / `MANDATORY_FINISH`
   are **parked** as their moderate equivalents (`MSO` / `MFO`) and counted in the
   summary's `parkedConstraintCount` (visible, not silent). Hard mandatory
   semantics are a documented follow-up.

## Alternatives considered

- **Inclusive throughout (do the `−1` inside the pass).** Matches what planners
  read, but every relationship bound and every max/min gains a `±1` correction and
  milestone special-cases multiply — precisely the off-by-one surface we must
  avoid on a top-risk feature. Rejected.
- **Continuous throughout (store offsets / exclusive-finish dates).** Clean maths,
  but the persisted `early_finish` would read a day "late" to any planner and
  disagree with every other CPM tool (P6/MSP show inclusive finishes). Rejected —
  the seam belongs at persistence, not in the stored data.
- **Model milestones as 1-day activities.** Removes the `D = 0` branch but invents
  a day of duration a milestone does not have, corrupting float and the critical
  path. Rejected.

## Consequences

- The relationship arithmetic (spec §4) is `−1`-free and reads exactly like the
  standard CPM formulation — easy to verify against the **golden suite** of
  hand-worked networks (the mitigation for the top correctness risk).
- Exactly **one** place converts offsets to dates (the persist step), so the
  inclusive/milestone rule is defined once and unit-tested once.
- The `WorkingDayCalendar` port is the clean seam M5 slots into; the engine has no
  calendar knowledge to unpick later.
- Planners see inclusive finishes consistent with P6/MSP; the summary's project
  finish matches the read-side aggregate by construction.
- **Deferred / debt:** progress-aware forecasting (actuals seeding the pass),
  hard mandatory-constraint semantics, and a per-plan near-critical threshold are
  explicit follow-ups — parked visibly, not hidden.

## References

- [`docs/specs/cpm-engine.md`](../specs/cpm-engine.md) — the feature spec (§4 the
  arithmetic; §1 the planned-only / near-critical / constraint-scope decisions).
- [`docs/plans/cpm-engine.md`](../plans/cpm-engine.md) — the implementation plan.
- ADR-0021 — the DAG invariant the passes rely on.
- ADR-0022 — CPM execution & persistence model (the recalculate endpoint, the
  engine-owned write, the `422` no-start path).
- PROJECT_BRIEF §11 (constraints), §14 (synchronous compute), §17 (CPM
  correctness as a top risk).
