# ADR-0035: SchedulePoint CPM semantics (the golden contract)

- **Status:** Proposed
- **Date:** 2026-07-15
- **Deciders:** James Ewbank (with Claude Code)

> **Draft / living.** Each decision below is the **documented intended behaviour** SchedulePoint's
> engine will implement and self-baseline as a golden (ADR-0034). A decision moves to **Accepted**
> when its owning capability milestone lands it. Until then it is the design target, not shipped code.

## Acceptance status

Clauses accept per owning milestone as that milestone lands (they are not all-or-nothing); the ADR
stays **Proposed** overall until every clause is built. Current state:

| Clauses                             | Owning milestone | Status       |
| ----------------------------------- | ---------------- | ------------ |
| §1–§6 (progress & the data date)    | M2               | **Accepted** |
| §7–§11 (constraints), §12 (N15)     | M4               | **Accepted** |
| §13–§14 (duplicate/cycle report)    | M4 (F8)          | **Accepted** |
| §22 (zero-duration task)            | M4               | **Accepted** |
| §17–§20 (float & critical)          | M6               | **Accepted** |
| §21 (level of effort)               | M5-epic          | **Accepted** |
| §24 (WBS-summary rollup)            | M5-epic          | **Accepted** |
| §23 (resource-dependent)            | M7               | **Accepted** |
| §26–§27 (duration types), N19/N20   | M7 (rung 4)      | **Accepted** |
| §28 (resource levelling), N21       | M7 (levelling)   | **Accepted** |
| §29 (%-complete-type & EV), N22–N24 | M7 (EV3)         | **Accepted** |
| §15–§16, §25 (arithmetic/boundary)  | M0/M1            | Proposed¹    |

¹ Behaviour already exists in the engine/boundary from earlier milestones; formal clause acceptance
is folded into the next conformance pass that asserts them as goldens (out of M4 scope).

## Context

The conformance fixture (ADR-0034) specifies inputs and intended behaviours but **no golden dates**,
because for a set of scheduling behaviours there is no single "correct" answer — P6, Asta, MS Project
and Spider legitimately differ, and the fixture's own `TEST_MATRIX.md` repeatedly says _"pick a rule
and document it."_ Since we have no external oracle, **we must decide and record SchedulePoint's own
semantics** so the golden snapshots have an authority to check against.

We default to **P6-aligned behaviour** where P6 has a de-facto-standard answer for UK/EPC
construction (our users' world), and make a deliberate, documented choice where it doesn't. These
decisions become the acceptance criteria for the capability milestones (M2, M4, M6) and the contract
for the negative cases.

## Decision

We will implement the following semantics. Each cites the milestone that will build and **Accept** it.

### Progress & the data date (→ M2)

1. **Default recalc mode: Retained Logic** (P6 default). For an out-of-sequence activity, remaining
   work waits for its incomplete predecessors. _Progress Override_ (remaining runs from the data
   date, ignoring incomplete predecessors) and _Actual Dates_ are selectable modes, not the default.
   The A4220→A4300 discriminator (fixture) must produce **different** dates across the three.
2. **The data date is a hard floor for remaining work.** No remaining (unstarted or in-progress)
   work is scheduled before the data date. Unstarted **open-start** activities collapse their early
   start to the **data date**, not the project start (A9500).
3. **A negative lag (lead) may not pull remaining work before the data date** — the lead is
   **truncated to the data date**, not honoured (N13).
4. **Suspend / resume.** Remaining work is scheduled from `max(data date, resume date)`; the
   suspended window is excluded from actual duration. A resume date **after** the data date (A4230)
   floors remaining work at the resume date, not the data date.
5. **Stopped activity** (remaining duration 0, duration-% 100, no actual finish): the remaining early
   finish is set to the **data date** (A3040), and that value propagates to successors (never null).
6. **Actuals never move.** Recorded actual start/finish are immutable across a recalc; only remaining
   work reschedules. Invalid actuals are **rejected at the boundary**: actual-finish-before-start
   (N06) and actual-in-the-future beyond the data date (N07) are errors; complete-without-actual-
   finish (N08) and remaining-duration>0-on-complete (N18) are **repaired with a warning** (finish =
   data date / remaining = 0).

### Constraints (→ M4)

7. **Mandatory constraints override the network in both passes and may legally break logic.**
   `MANDATORY_START`/`MANDATORY_FINISH` pin the date even if predecessors slip past it; the violated
   relationship yields **negative float propagating backward**, and the engine **produces the
   (possibly impossible) schedule and flags the violation — it never silently "fixes" it** (N10).
   This **un-parks** the current MSO/MFO treatment.

   > **§7 amendment — the violation-output contract (M4).** Produce-and-flag needs a machine-readable
   > output, so the engine gains an **engine-owned per-activity `constraintViolated` boolean** (true
   > when a mandatory pin overrides a stronger logic bound — a forward pin earlier than the
   > network-earliest, or a backward pin that forces negative float) and a plan-level
   > **`constraintViolationCount`**, which **replaces the current `parkedConstraintCount`** (mandatory
   > is no longer silently parked, so a "parked" count is obsolete). §12's N15 soft case — a
   > `START_ON_OR_AFTER` earlier than the data date — is reported separately via a plan-level
   > **`constraintWarningCount`** (a warning, not a violation: it is honoured-and-noted, not broken).
   > These are **produced, never repaired**; the boundary neither rejects nor rewrites a mandatory
   > constraint. Recorded here (no standalone ADR — no new axis/invariant) per the M4 acceptance gate;
   > see `docs/DECISIONS.md`.

8. **Start-On / Finish-On pin both passes** (early = late); the forward pass may not move them later
   nor the backward pass earlier.
9. **Expected Finish:** with the option on, remaining duration is **recalculated** so the activity
   finishes on the expected date (A6200); with it off (S12) the date differs.
10. **Secondary constraint:** the primary acts on the forward pass, the secondary on the backward
    pass (A5200: SNET primary + FNLT secondary).
11. **As-Late-As-Possible** is a **zero-free-float** pass (push as late as successors allow), not a
    date constraint: after scheduling, free float = 0 while total float is unchanged (A9400).
12. **A constraint landing on a non-work instant rolls forward to the next working instant**
    (exact instant once hour calendars land — ADR-0036); a `START_ON_OR_AFTER` earlier than the data
    date does not pull remaining work before it and emits a **warning** (N15).

### Relationships, cycles & topology (→ M0/M4)

13. **Duplicate relationship: reject** with a clear error naming the pair. We do **not** silently
    dedupe or keep-most-constraining (N04). **Amendment (M4-F8):** the reject is scoped to an
    **exact duplicate — the same ordered pair _and_ type** (the write-path partial-unique index
    `uq_dependencies_pred_succ_type`), not the whole pair. A _different-type_ relationship between the
    same pair (an FS **and** an SS — the construction **ladder**/overlap technique) is **permitted**:
    P6 allows one relationship of each of the four types between a pair, and the ladder is a standard
    construction construct we deliberately keep. The original wording ("only one per pair") reflected
    the fixture's simplification; N04's intent — never silently dedupe, always reject a true duplicate
    — is fully met by per-(pair, type) uniqueness. A second FS on an existing A→B FS is rejected 409
    `DUPLICATE_DEPENDENCY`; an SS on that pair is allowed.
14. **Cycle reports name the exact members** of the cycle (N01/N03), including cycles that exist only
    through SS/FF edges — not merely "loop detected."
15. **SF arithmetic:** `EF(succ) ≥ ES(pred) + lag`, then `ES(succ) = EF(succ) − RD(succ)`; correct for
    negative lag (A10460 SF−8h) with no sign error.
16. **Dangling / open ends are scheduled correctly** (early start from finish for an FF-only
    successor; open-ends get float); a **schedule-quality report** (danglers, redundant logic, open
    ends — DCMA-style) is a **later, non-blocking** add, not a scheduling behaviour.

### Float & critical (→ M6)

17. **Default critical definition: Total Float ≤ threshold** (threshold default 0), Total Float
    computed as **Finish Float** by default (P6 default). **Longest Path** is a selectable alternative
    definition (S07): under Longest Path a hugely-negative-float but **open-ended** activity (A12700)
    is **not** critical, whereas under TF ≤ 0 it is — the cleanest discriminator between the two.
18. **Total Float as Start / Finish / Smallest** is selectable (S13) via a plan-level `totalFloatMode`
    (default `FINISH`, the P6 default). **SchedulePoint semantic (M6-F3):** total float is measured on
    the activity's **own** calendar (ADR-0037 §4), on **both** the start and finish sides. Because
    advancing an activity's start and finish by its duration on that one calendar preserves the
    working-time gap, **start-float and finish-float coincide for every _unprogressed_ activity** — so
    the three modes agree, and the fixture's mixed-calendar S13 divergence (`A4340/A7710/A11100/A5500`)
    is **deliberately not reproduced** (verified: 0/4 diverge). The modes diverge only for a
    **progressed** activity, whose late start is frozen on its actual start (start-float collapses to 0) while its finish-float reflects the remaining work. P6's start-vs-finish split instead measures
    the two sides on different _neighbour_ calendars — a multi-calendar-measurement artefact we do not
    adopt (north-star, not parity — ADR-0034).
19. **Multiple float paths** (S11) are **contiguous driving chains** to the target activity, not
    activities sorted by total float.
20. **"Make open-ended activities critical"** is an option, **default off** (P6 default); on (S08) it
    marks open-ends critical.

### Activity types (→ M1/M5/M7)

21. **Level of Effort:** duration is **derived** from its SS-predecessor's start to its FF-successor's
    finish; an LOE **never drives a successor, never appears on the critical path, and never inherits
    negative float** (e.g. from a downstream FNLT); an LOE with no span is rejected/warned (N12).
22. **Zero-duration task ≠ milestone:** a zero-duration `TASK` has both a start and a finish (equal),
    can carry resources, and obeys duration-type rules; it is not coerced to a milestone (A7550).
23. **Resource-dependent** activities schedule on the **resource's** calendar, not the activity's
    (A6100 on the crane-hire window; A8300 on the Mon–Thu specialist calendar).
24. **WBS-summary** dates roll up from the earliest start / latest finish of the branch; summaries
    carry no logic.

### Input validity (boundary)

25. **Reject** negative duration (N09) and negative resource units (N14) at the API boundary; **coerce
    a milestone's non-zero duration to zero** with a warning (N17). **(→ M7, ADR-0040)** also **reject a
    negative `units_per_hour` rate (N19)** at the boundary — a DTO `@Min(0)` backed by a nullable-safe
    `ck_resource_assignments_units_per_hour_nonneg` CHECK — and **reject a zero rate on a units-driven
    duration recompute (N20)** in the service **before any division** (`UNITS_PER_HOUR_ZERO`), so the
    `resolveTriad` recompute is **total** (never NaN / Infinity / a negative duration). N20 is a service
    guard because a CHECK cannot read the activity's `duration_type` to know the rate is a divisor.
    **(→ M7, ADR-0041)** also **reject a negative `resource.max_units_per_hour` capacity (N21)** at the
    boundary — a DTO `@Min(0)` backed by a nullable-safe `ck_resources_max_units_per_hour_nonneg` CHECK
    (**NULL = uncapped**, the parity-preserving default). A negative capacity is meaningless as a ceiling;
    rejecting it keeps the levelling feasibility sweep total (spare headroom `capacity − demand` is never
    a negative ceiling).

### Duration types (→ M7)

26. **Duration-type recompute contract.** Every activity carries a **`duration_type`** — one of the four
    P6 values `FIXED_DURATION_AND_UNITS_TIME` (default) | `FIXED_DURATION_AND_UNITS` | `FIXED_UNITS` |
    `FIXED_UNITS_TIME` — that keeps the identity **`Units = Duration × Units/Time`** (`U = D × R`, with
    `D` = working hours = `durationMinutes / 60`) true after a planner edits one of the three quantities.
    The type names which quantity is **recomputed** for a given edited field (the pure `resolveTriad`
    truth table, ADR-0040 §3):

    | Duration type                   | edit Duration | edit Units | edit Units/Time |
    | ------------------------------- | ------------- | ---------- | --------------- |
    | `FIXED_UNITS`                   | `R := U/D`    | `R := U/D` | `D := U/R`      |
    | `FIXED_UNITS_TIME`              | `U := D×R`    | `D := U/R` | `U := D×R`      |
    | `FIXED_DURATION_AND_UNITS`      | `R := U/D`    | `R := U/D` | `U := D×R`      |
    | `FIXED_DURATION_AND_UNITS_TIME` | `U := D×R`    | `R := U/D` | `U := D×R`      |

    **Duration is auto-derived only under the two units-driven types** (`FIXED_UNITS`, `FIXED_UNITS_TIME`)
    and only on the complementary edit; every other cell **holds the duration** (P6's "protect duration
    first, then the pair's second member, the remaining field absorbs" priority). Changing **only** the
    type never retroactively re-solves the triad — it governs future edits. **Rounding:** a derived
    `durationMinutes` is rounded **half-up to a whole minute** and clamped `≥ 0` (ADR-0036 integer
    minutes); `budgetedUnits` / `unitsPerHour` are `Decimal(18,4)`. The identity holds to that grid; a
    sub-minute residual on a derived duration is documented, absorbed by re-deriving the shown dependent.
    The recompute is a **service-boundary** concern resolved once at write time — the **CPM engine is
    untouched** and reads the already-resolved `durationMinutes` (ADR-0040 §6).

27. **Units/time home & the derivation boundary.** The planned **rate** (`units_per_hour`) lives on the
    **driving `ResourceAssignment`** (ADR-0039's `is_driving` ≤1-driver), **not** the `Resource`
    (`resource.max_units_per_hour` stays reserved for levelling). **Only the driving assignment
    participates** in the triad; non-driving assignments' units/rate are inert bookkeeping. A **NULL rate**
    (no driving assignment, or a driver with no rate entered) makes the triad **inert** — `resolveTriad`
    is a **no-op**, `durationMinutes` is exactly what the planner entered, and the whole feature is dark
    (the byte-parity gate, ADR-0034/0040 §4). The derived field is **server-computed**, never trusted
    from the client. Negative (N19) and zero-divisor (N20) rates are rejected per §25.

### Resource levelling (→ M7)

28. **Resource-levelling semantics.** Levelling is an **opt-in, pure, second pass** on top of the CPM
    network (ADR-0041): the network (early/late/float/critical) is computed **first and unchanged**, and
    levelling then delays activities within a resource-constrained model, producing an **additive leveled
    overlay** (`leveledStart`/`leveledFinish` + `levelingDelay` + plan counts). SchedulePoint's chosen
    semantics — the golden contract for the fixture's `levelling_test` / S10:

    - **Deterministic serial priority-list heuristic** (levelling is NP-hard; there is no single "correct"
      answer, so we fix a reproducible one). Activities are placed **one at a time**, highest-priority
      first, each into the **earliest capacity-feasible working window at or after its early start**. The
      single **composite priority key** — `levelingPriority` asc (client-settable, lower = higher; NULL
      sorts **last** as +∞) → **total float** asc → **early start** asc → **activity id** asc — makes the
      result independent of input order (the determinism invariant; the goldens are reproducible).
    - **Capacity = `resource.max_units_per_hour`** (ADR-0039-reserved, activated here): `Decimal(18,4)?`,
      **NULL = uncapped** (never over-allocated — the parity default), `>= 0` (N21, §25). **Demand** at a
      working instant is the **sum of `unitsPerHour` of every active assignment running then** — **all**
      assignments consume capacity, not only the schedule-driving one — measured on the **resource's own
      calendar** (ADR-0037) via a bounded event-driven interval sweep.
    - **Level within total float first, then extend.** A delay that fits within total float preserves the
      project finish; only when float is exhausted does levelling **extend** the schedule. The plan option
      **`levelWithinFloatOnly`** (default `false`, P6's off-by-default) forbids extension: a residual
      over-allocation is then left **unresolved at the within-float cap**, not extended.
    - **Exclusions — never moved (occupy in place).** **Mandatory**-constrained (`MANDATORY_START`/
      `MANDATORY_FINISH`), **Level-of-Effort** (§21), **WBS-summary** (§24), **milestone**, and **time-fixed
      progressed** (started) activities are **never delayed**; they hold the resource profile at their
      network position so others level around them. A residual over-allocation a pinned activity causes is
      **reported**, never resolved by moving the pinned one.
    - **Window conflict = extend-and-flag (Q1).** When serialising pushes an activity **past a resource's
      availability window** (a window-only crane-hire calendar that runs out), the activity is still placed
      there and **`levelingWindowExceeded`** is set (engine-owned produce-and-flag + plan count) — never a
      hang, never silent success. (The report-and-stop alternative is defensible; extend-and-flag is chosen
      and documented, per the fixture's explicit open question.)
    - **Network float authoritative (Q2).** The pure early/late/float/critical are **not recomputed** on
      the leveled dates; the leveled dates are an **overlay only**. This keeps the critical path meaningful
      and the off-path byte-parity gate trivially true (leveling-aware float is a named later rung).
    - **Self-over-allocation (§2).** A single activity whose own demand on a resource exceeds that
      resource's capacity cannot be fixed by delay: **`selfOverAllocated`** is set, the activity is placed
      at its early start (not split), and the pass continues.
    - **Opt-in, additive, dark by default.** Levelling runs only when the plan's **`levelResources`** flag
      is on (and it has assignments); off (the default) the recalculate output is **byte-identical** — the
      parity gate. The leveled columns are **engine-owned** (written only by the recalc batched `UPDATE`,
      never a write DTO, never touching `version`/`updated_at`), and the schedule summary surfaces
      `leveledActivityCount` / `levelingWindowExceededCount` / `selfOverAllocatedCount` /
      `leveledProjectFinish` (0 / null when off).

### Percent-complete-type & Earned Value (→ M7 EV3)

29. **Percent-complete-type & Earned-Value semantics.** Earned Value is a **pure read-model** (ADR-0042
    §2) — it never enters `computeSchedule`, adds no write pass, and owns no persisted column, so the
    recalc parity gate stays structurally trivial (the CPM engine is byte-identical whether or not any
    cost/EV data exists). SchedulePoint's chosen semantics — the golden contract for the fixture's
    `pct_physical` / `pct_units` / `cost_*` tags:

    - **Three %-complete types, one performance measure.** Every activity carries a
      `percentCompleteType` (`DURATION` default | `UNITS` | `PHYSICAL`) that selects **which** measure
      feeds EV's performance % — it never changes a CPM date (the key decoupling, ADR-0042 §1).
      **Duration** derives performance % from the schedule's own %-complete (elapsed vs total working
      time, already computed by M2 progress — the behaviour-preserving default). **Units** derives it
      from `Σ actualUnits / Σ budgetedUnits` across the activity's assignments (capped 0–100; 0 when
      budgeted units is 0). **Physical** reads the hand-entered `physicalPercentComplete` verbatim
      (capped 0–100) — a performance measure that **earns value but moves no date**, decoupled from the
      schedule by design (a concrete pour can be "60% built" while its remaining duration is
      independently forecast).
    - **Milestones are 0/100 regardless of type.** A milestone's performance % is binary on its own
      schedule %-complete (0 until complete, then 100) — its `percentCompleteType` is irrelevant, since a
      milestone has no partial physical/units state. **Level of Effort has no independent performance
      measure**: it earns on **Duration** (its ADR-0035 §21 span-derived %-complete) regardless of its
      nominal type, since an LOE's progress is definitionally its span's elapsed proportion. **A
      WBS-summary carries no cost of its own** — every EV figure (BAC/PV/EV/AC and its derived indices)
      is the roll-up of its branch, summed **deepest-first** over the `parentId` tree (the M5-epic §24
      rollup pattern), never entered or computed independently.
    - **BAC / AC — the cost source is both an activity's assignments and its own expense (ADR-0042 §1
      Q1).** `BAC = Σ (assignment budgetedCost ?? budgetedUnits × resource rate) + activity
budgetedExpense`; `AC = Σ (assignment actualCost) + activity actualExpense`. This makes EV useful
      for resourced work (crew/plant cost) **and** lump-sum/non-resourced construction activities (a
      direct budgeted expense) in the same model.
    - **EV = BAC × performance %** (rounded once, to the minor unit).
    - **PV — time-phased against the committed plan, with a flagged live-budget fallback (ADR-0042 §1
      Q2).** Planned Value is the **active ADR-0025 cost baseline's** budgeted cost, spread linearly
      across the baselined activity's baseline start→finish (a milestone is binary on its baseline
      start) and measured to the **data date** on the plan/activity calendar (ADR-0037), summed and
      rolled up like BAC/EV/AC. When no cost baseline exists for an activity (no active baseline, or one
      captured before this rung), PV falls back to the **live** budget (BAC) time-phased over the
      persisted `earlyStart`/`earlyFinish`, and the plan-level **`costBaselineMissing`** flag is set —
      produced, never hidden, exactly the produce-and-flag posture §7 established for constraints.
    - **The default EAC forecast is `BAC / CPI`** (ADR-0042 §1 Q3, P6's "typical/performance-factor"
      method) — a plan's `eacMethod` selects the alternates: `REMAINING_AT_BUDGET` (`AC + (BAC − EV)`,
      the "atypical" remaining-work-at-budget forecast) and `CPI_TIMES_SPI` (`AC + (BAC − EV) / (CPI ×
SPI)`, the schedule-**and**-cost-adjusted forecast). All three are computed by the same guarded
      `deriveMetrics` helper at every roll-up level (leaf, WBS summary, plan total), so the guards below
      are identical everywhere.
    - **Divide-by-zero guards — every index a defined sentinel, never `NaN`/`Infinity`.** `SPI = EV / PV`
      is **`null` when `PV = 0`** (nothing planned by the data date yet); `CPI = EV / AC` is **`null`
      when `AC = 0`** (nothing spent yet); `TCPI = (BAC − EV) / (BAC − AC)` is **`null` when `BAC = AC`**.
      `EAC` is **always defined**: the `CPI` method falls back to the atypical `AC + (BAC − EV)` forecast
      whenever CPI is undefined or not strictly positive (AC = 0, or a pathological EV/AC ratio), and the
      `CPI_TIMES_SPI` method falls back the same way whenever `CPI × SPI` is not strictly positive. `ETC
= EAC − AC` and `VAC = BAC − EAC` inherit EAC's guard, so they too are always defined.
    - **N22 — negative cost/rate/expense: reject.** A resource's cost rate, an assignment's
      `budgetedCost`/`actualCost`, and an activity's `budgetedExpense`/`actualExpense` are rejected at
      the API boundary when negative (a DTO `@Min(0)` backed by a nullable-safe CHECK) — money is never
      allowed to go negative; a null/unset rate contributes zero cost, which is not an error (the
      parity-preserving default, mirroring N19/N21's shape).
    - **N23 — physical %-complete outside 0–100: reject.** `physicalPercentComplete` is validated to an
      integer `0–100` (or null = unset) at the API boundary (`@Min(0)` + `@Max(100)`); an out-of-range
      value is a 422, never silently clamped on write (EV itself still clamps defensively on read, the
      same belt-and-braces posture as every other %-complete input).
    - **N24 — actual cost/units on a not-started activity: a read-time warning, never a reject.** Booking
      an actual cost/units against an activity that shows no recorded progress (schedule %-complete and
      physical %-complete both 0) is **not an error** — spend-without-progress is exactly the Cost
      Variance signal EV exists to surface, so hiding it behind a rejection would defeat the point. The
      EV read instead **counts** every such leaf in a plan-level `costWarningCount` (produce-and-flag,
      the same posture as `constraintWarningCount`/§7 and `costBaselineMissing` above) while still
      valuing the activity normally (BAC/AC/EV computed exactly as any other row).

## Alternatives considered

- **Progress Override as default.** Simpler (remaining always from the data date) but hides broken
  logic and diverges from P6's default; rejected — Retained Logic is the construction-industry
  expectation, with Override available.
- **Silently "fix" impossible mandatory schedules.** Friendlier output, but destroys the planner's
  ability to see an infeasible constraint; rejected — produce-and-flag is the P6 behaviour and the
  honest one.
- **Dedupe duplicate relationships.** Convenient, but hides a modelling error and makes the effective
  logic ambiguous; rejected in favour of an explicit reject.
- **Longest Path as the default critical definition.** Defensible, but TF ≤ 0 is P6's default and what
  most construction planners expect; kept Longest Path as a selectable definition instead.

## Consequences

- **Positive.** The ambiguous behaviours now have a single documented authority, so golden snapshots
  can assert them without an external oracle; the acceptance criteria for M2/M4/M6 are concrete.
- **Negative / debt.** These are **our** judgement calls; a wrong choice is recoverable (self-
  baselined, reviewed on drift) but should be socialised with planners. Some (e.g. suspend/resume-
  after-data-date) are genuine tool-divergence points and may warrant revisiting against real user
  plans.
- **Neutral.** Choosing P6 defaults is a stance, not a parity commitment; an external cross-check
  (ADR-0034) can later confirm or challenge specific rows.

## References

- [ADR-0034 — conformance methodology](0034-engine-conformance-methodology.md) · the no-oracle golden
  strategy this contract feeds.
- [Capability matrix](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md) · rows citing M2/M4/M6.
- ADR-0036 — hour-granular rework (exact instants for constraint roll-forward, elapsed durations).
- The fixture `TEST_MATRIX.md` (§2 constraints, §5 progress, §6 float) and `negative_cases.json`.
- [ADR-0042 — percent-complete types & Earned Value](0042-percent-complete-and-earned-value.md) · the
  read-model design §29 documents the golden contract for (`percentCompleteType`, BAC/PV/EV/AC, the
  EAC methods, N22–N24).
- [ADR-0025 — baselines: snapshot-copy model](0025-baselines-snapshot-and-variance.md) · the cost-
  baseline amendment §29's PV time-phasing reads from.
- `apps/api/src/modules/schedule/engine/earned-value.ts` / `earned-value.spec.ts` (the pure module +
  first-principles unit goldens) and `apps/api/src/modules/schedule/conformance/earned-value-adapter.ts`
  / `earned-value-conformance.spec.ts` (the EV3 fixture-grounded golden + differentials this §29
  Accepts against).
