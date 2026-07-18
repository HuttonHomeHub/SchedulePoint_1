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

| Clauses                                 | Owning milestone  | Status            |
| --------------------------------------- | ----------------- | ----------------- |
| §1–§6 (progress & the data date)        | M2                | **Accepted**      |
| §7–§11 (constraints), §12 (N15)         | M4                | **Accepted**      |
| §13–§14 (duplicate/cycle report)        | M4 (F8)           | **Accepted**      |
| §22 (zero-duration task)                | M4                | **Accepted**      |
| §17–§20 (float & critical)              | M6                | **Accepted**      |
| §21 (level of effort)                   | M5-epic           | **Accepted**      |
| §24 (WBS-summary rollup)                | M5-epic           | **Accepted**      |
| §23 (resource-dependent)                | M7                | **Accepted**      |
| §26–§27 (duration types), N19/N20       | M7 (rung 4)       | **Accepted**      |
| §28 (resource levelling), N21           | M7 (levelling)    | **Accepted**      |
| §29 (%-complete-type & EV), N22–N24     | M7 (EV3)          | **Accepted**      |
| §30 (external / inter-project), N25–N26 | IPD (M1)          | **Accepted**      |
| §30.5–§30.8 (live cross-plan), N30–N33  | IPD M2 (ADR-0045) | Accepts w/ F1–F8² |
| §31 (resource curves), N29              | M7 (rung 5, F3)   | **Accepted**      |
| §32 (cost accrual)                      | M7 (rung 5, F1)   | **Accepted**      |
| §33 (weighted steps), N27/N28           | M7 (rung 5, F2)   | **Accepted**      |
| §15–§16, §25 (arithmetic/boundary)      | M0/M1             | Proposed¹         |

¹ Behaviour already exists in the engine/boundary from earlier milestones; formal clause acceptance
is folded into the next conformance pass that asserts them as goldens (out of M4 scope).

² §30.5 Accepts with F4 (derivation seam), §30.6 with F3 (plan-level DAG), §30.7 with F6 (staleness),
§30.8 with F5 (programme recalc); N30/N31/N33 with F3, N32 with F4/F5. Full acceptance lands with the
F7 conformance slice (cross-plan differential + goldens). See ADR-0045.

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

### External / inter-project dates (→ IPD M1, ADR-0043)

30. **External / inter-project date semantics.** An activity may carry imported commitments from another
    project — an `externalEarlyStart` and/or an `externalLateFinish` (ADR-0043) — and a plan carries an
    `ignoreExternalRelationships` toggle. These are **scheduling inputs to `computeSchedule`, not a new
    pass and not a read-model**: absent inputs + the option off ⇒ the engine is byte-identical (the parity
    gate). SchedulePoint's chosen semantics — the golden contract for the fixture's `net_external_*` /
    `interproject` tags and scenario **S09**:

    - **§30.1 External early start = SNET-shaped forward bound, floored at the data date.**
      `earlyStart = max(networkEarlyStart, externalEarlyStart, dataDate)`. When an activity carries both an
      internal predecessor and an external early start, **the later of the two drives** (the fixture's
      A2120). Folded into the forward pass _before_ the constraint clamp, so it composes with an SNET/FNET
      (`max`) and yields to a hard pin (§30.3).
    - **§30.2 External late finish = FNLT-shaped backward bound.**
      `lateFinish = min(networkLateFinish, externalLateFinish)` (the external instant's working-day end on
      the activity's own calendar). If it is earlier than logic can achieve, **total float goes negative**
      on the driving chain — surfaced (and made critical), never an error.
    - **§30.3 External bounds are soft — never mandatory pins.** They never set `constraintViolated`, and a
      hard pin (`MSO`/`MFO`/`MANDATORY_*`, and the fixture's `FINISH_ON` on A12500) still governs its side:
      because the external bound is folded in _before_ the constraint clamp, a pin's unconditional clamp
      discards it. An external bound therefore **coexists** with an internal constraint on the same
      activity, tightening the schedule only where no harder pin already fixes it.
    - **§30.4 Ignore-external drops both directions.** `ignoreExternalRelationships` drops every external
      early start **and** every external late finish (the P6 "ignore relationships to/from other projects"
      toggle); internal constraints/logic are untouched. This is scenario **S09**: with it on, the five
      external early starts drop and the procurement chain pulls left.
    - **Observability.** An activity whose binding bound is an external date is flagged `externalDriven`
      and counted in a plan-level `externalDrivenCount` (produce-and-flag, mirroring `constraintViolated`/
      §7) — both **optional/absent on the no-external path** so existing golden snapshots are unchanged.
    - **N25 — external early start before the data date: honour but clamp.** Floored at the data date
      (§30.1) and counted in `constraintWarningCount` — the same "date before the data date" warning class
      as N15, not a reject (an imported past-dated commitment is common and must not block scheduling).
    - **N26 — external late finish before external early start (both set): boundary reject.** Rejected at
      the DTO/service boundary (`EXTERNAL_FINISH_BEFORE_START`, 422) with a nullable-safe DB CHECK backstop
      (mirroring N06's actual-finish-before-start) — an inverted window is invalid input, caught before the
      engine ever sees it.

    **Live cross-plan solve (ADR-0045, inter-project Milestone 2).** The §30.1–§30.4 clamps are unchanged;
    M2 adds a live cross-plan edge that _derives_ the M1 external instants above the pure engine, so the
    parity gate holds by construction (no cross-plan edge ⇒ identical engine input):

    - **§30.5 Live derivation composes with the manual column.** A live cross-plan edge derives the
      successor's external early start (predecessor's **persisted computed** early dates + the edge's typed
      FS/SS/FF/SF lag, §30.1-shaped) and, symmetrically, an outgoing edge derives an external late finish
      (§30.2-shaped). The effective bound fed to the engine is the **later-of** (forward) / **tighter-of**
      (backward) the derived value and the M1 hand-entered column. Derived values are transient (recomputed
      each recalc) and never overwrite the M1 columns. Absent a cross-plan edge, the M1 column stands.
    - **§30.6 Plan-level DAG.** The directed graph of plans (nodes) and cross-plan edges is **acyclic**; with
      each plan's activity DAG (ADR-0021) the programme graph is acyclic and the solve is a single
      topological pass (no fixpoint). One direction only between any two plans (bidirectional interfaces are
      out of scope for M2).
    - **§30.7 Staleness is pull-computed.** A single-plan recalc leaves downstream plans **stale**; staleness
      is a read-time comparison of `schedule_computed_at` across the upstream closure (`scheduleStale` + the
      stale upstream plan ids on the summary). A programme recalc clears it upstream-first. No
      auto-propagation in M2.
    - **§30.8 Programme order & determinism.** A programme recalc resolves the target plan's upstream closure,
      sorts it topologically, and recalculates each plan **upstream-first** using the unchanged ADR-0022
      single-plan transaction; per-plan advisory locks are acquired in the deterministic topological order
      (deadlock-free). Default: the caller must hold the pen (ADR-0028) on every plan the solve writes, else
      fail-fast 423 with the blocked-plan list (no partial write).
    - **N30 — cross-plan edge that would close a plan-level cycle: reject** 409 `CROSS_PLAN_CYCLE_DETECTED`
      (plan-grain analogue of ADR-0021 `CYCLE_DETECTED`).
    - **N31 — cross-plan edge with both endpoints in the same plan: reject** 422 `CROSS_PLAN_SAME_PLAN` (use
      an intra-plan dependency).
    - **N32 — programme recalc where an upstream plan has never been calculated: warn-and-proceed.** That
      edge contributes **no** derived bound (treated as absent) and is counted in `crossPlanUpstreamMissingCount`;
      never an error.
    - **N33 — duplicate cross-plan edge (same predecessor/successor/type among active rows): reject** 409
      `DUPLICATE_CROSS_PLAN_DEPENDENCY` (partial-unique index, mirrors `DUPLICATE_DEPENDENCY`).

### Resource loading curves (→ M7 rung 5, ADR-0044 §3 / F3)

> §32 (cost accrual) and §33 (weighted steps) are the other two ADR-0044 slices. This slice (F3) Accepts
> §31 + N29 and **closes the ADR-0044 rung** (the last capability-matrix ⚪ → ✅).

31. **Resource-curve semantics.** Like §29's Earned Value, §32's accrual and §33's steps, resource
    loading curves are a **pure read-model** concern — they never enter `computeSchedule`, add no write
    pass, own no persisted engine column (only the settable `resource_assignments.curve_type` enum), and
    (this rung) do **NOT** feed the levelling pass (`level.ts` stays flat-rate, Q2). SchedulePoint's chosen
    semantics — the golden contract for the fixture's `res_curve_*` tags:

    - **A curve shapes the histogram, never a date.** Each assignment carries a `curveType`
      (`UNIFORM` default | `BELL` | `FRONT_LOADED` | `BACK_LOADED` | `DOUBLE_PEAK`) — a named P6 21-point
      profile the pure `resource-histogram.ts` read-model distributes the assignment's `budgetedUnits` by
      across its **effective span** (`start + assignment-lag → finish`, on the activity's own calendar,
      ADR-0037), aggregating a **units-over-time histogram per resource**. It moves no CPM date and never
      touches float, EV, or the levelling overlay — only the **loading shape over time**.
    - **Units are conserved.** The whole `budgetedUnits` is distributed across the span, so a resource's
      `Σ buckets === Σ its assignments' budgetedUnits` **exactly** (a sub-grain rounding residual is folded
      into the largest bucket at the `DECIMAL(18,4)` storage grain). The curve is a **density**: the
      profile's 21 per-interval weights define a piecewise-linear CDF over the normalised span, and a
      bucket receives `budgetedUnits × (CDF(uHi) − CDF(uLo))`.
    - **UNIFORM / absent is a flat load — byte-identical to a flat rate.** `UNIFORM` has no profile: it is
      a genuine flat distribution `CDF(u) = u` at any bucket count (the fixture's `LINEAR` curve maps to
      it — a flat load, not the fixture's discretised twenty-of-5 array), so an assignment with no curve
      reads identically to a plain flat-rate load (the parity path). The built-in `BELL` / `FRONT_LOADED`
      / `BACK_LOADED` / `DOUBLE_PEAK` profile constants are **byte-equal to the fixture's `resource_curves`
      points**, so the goldens self-baseline first-principles (ADR-0034, no external oracle).
    - **Named P6 profiles only (Q1).** The five named enum values fully serve the fixture; a **user-defined
      point-array curve library** (org-scoped curve entities + CRUD + authoring UI) is deferred — it is a
      whole parallel model for value the named enum already delivers.
    - **Curves do NOT feed levelling this rung (Q2).** Levelling (§28 / ADR-0041) reads a **flat**
      `units_per_hour` as demand; curve-aware levelling would reshape `level.ts`'s demand sweep and
      re-baseline the S10 golden — an engine-adjacent change. The curve is a **histogram read-model** only;
      if curve-aware levelling is later wanted it is a separate ADR amending ADR-0041.
    - **The histogram is `schedule:read`, not `cost:read` (Q5).** A units histogram is **schedule** data,
      not commercially-sensitive money, so `GET …/schedule/resource-histogram` is gated on `schedule:read`
      (every member) — unlike the `cost:read` Earned-Value read.
    - **N29 — a profile that does not sum to 100 ⇒ normalise to the budget, never a reject.** The
      read-model normalises **any** profile by its own weight sum, so units are conserved regardless; when
      a present profile does not sum to 100 (within epsilon) it is counted as a `curveNormalisedCount`
      data-quality signal (the §29 `costWarningCount` precedent) — produce-and-flag, never a reject, never
      a divide-by-zero (an all-zero or empty profile falls back to the flat load). The built-in profiles
      all sum to 100, so N29 fires only for a hostile/synthetic profile.

### Cost accrual (→ M7 rung 5, ADR-0044)

> §31 (resource curves) and §33 (weighted steps) are the other two ADR-0044 slices; each Accepts with its
> own slice (F3 / F2) and adds N27–N29 then. This slice (F1) Accepts §32 only.

32. **Cost-accrual semantics.** Like §29's Earned Value, cost accrual is a **pure read-model** concern —
    it never enters `computeSchedule`, adds no write pass, and owns no persisted engine column (only the
    settable `activities.accrual_type` definition input). SchedulePoint's chosen semantics — the golden
    contract for the fixture's `accrual_start` / `accrual_uniform` / `accrual_end` tags:

    - **Accrual changes _when_ cost is recognised, never a date.** Every activity carries an
      `accrualType` (`UNIFORM` default | `START` | `END`) that governs how its cost lump-sum (its
      `budgetedExpense` and any assignment-derived budget — the §29 BAC source) is **time-phased** into
      the Planned-Value / cost S-curve as the data date advances. It moves no CPM date and never affects
      EV, AC, BAC, SPI/CPI, or float — only the **PV curve's shape** over time (a crane mobilisation
      recognised up-front vs retention held to the end is a cash-flow fact, not a scheduling one).
    - **The three shapes.** `START` recognises the activity's whole PV the moment the data date reaches
      its **start** (planned % jumps 0 → 100 at the start); `END` recognises nothing until the data date
      reaches its **finish** (0 → 100 at the finish); `UNIFORM` (default) spreads it **linearly** across
      the working span `[start, finish)` measured on the plan/activity calendar (ADR-0037) — **exactly
      the pre-ADR-0044 PV math**, so a plan with no accrual data (every activity `UNIFORM`) reads
      **byte-identical** to before (the parity gate). A **milestone** is binary on its start regardless
      of accrual (a zero-span event's cost lands at its instant).
    - **One accrual type per activity (the fixture's per-expense collapse, ADR-0044 §Q4).** SchedulePoint
      models a single activity cost lump-sum (the §29 `budgetedExpense` grain), so the fixture's
      per-`expenses.accrual_type` value collapses onto the one activity `accrualType`; the conformance
      adapter documents this collapse at the point of use. A per-expense accrual table is deferred until
      multiple differently-accruing expenses per activity are a real need (ADR-0044 §Q4).
    - **No negative case.** Accrual is a closed three-value enum with a constant default; there is no
      out-of-range or divide-by-zero boundary to guard (the degenerate zero-length-span past its start is
      the §29 PV path's existing "fully planned" fallback). ADR-0044's N27–N29 belong to the **steps**
      (§33) and **curve** (§31) slices, not this one.

### Weighted activity steps (→ M7 rung 5, ADR-0044 §2 / F2)

> §31 (resource curves) is the remaining ADR-0044 slice (F3) and Accepts with it, adding N29. This
> slice (F2) Accepts §33 + N27/N28.

33. **Weighted-steps semantics.** Like §29's Earned Value and §32's accrual, weighted steps are a **pure
    read-model / input** concern — they never enter `computeSchedule`, add no write pass, and own no
    persisted engine column (only the `activity_steps` child table + its bulk-replace sub-resource).
    SchedulePoint's chosen semantics — the golden contract for the fixture's `code_steps` tag:

    - **Steps roll up to the PHYSICAL %-complete as the weight-weighted mean.** When an activity has
      steps, its physical %-complete is `Σ(wᵢ·pᵢ)/Σ(wᵢ)` (each `pᵢ` clamped to 0–100), computed by the
      single shared resolver `rollupPhysicalPercent` used by both the EV read-model and (client-side) the
      API. It feeds the ADR-0042 `PHYSICAL` Earned-Value measure ONLY — it moves no CPM date and never
      affects the `DURATION`/`UNITS` measures.
    - **Steps win over the manual field when present.** With one or more steps carrying a positive total
      weight, the weighted mean **overrides** the hand-entered `physicalPercentComplete`. With **no steps**
      the manual field stands exactly as before ADR-0044 — the byte-identical parity path (an activity
      with no steps reads identically; the EV goldens are unchanged). The fixture's A4200 is the worked
      case: its four steps roll to **35.0005%** (`(10·100 + 35·70 + 35·1.43 + 20·0)/100`), deliberately ≠
      its 40% duration-% (the `prog_rd_vs_pct_divergence` discriminator); A7100's four all-zero steps roll
      to **0%**.
    - **N27 — all-zero-weight ⇒ manual fallback + count, never a reject.** If steps are present but every
      weight is 0, the resolver falls back to the manual `physicalPercentComplete` (never a divide-by-zero)
      and the EV read counts a `stepWeightZeroCount` data-quality warning (the §29 `costWarningCount`
      precedent) — produce-and-flag, never a reject.
    - **N28 — step %-complete out of 0–100 ⇒ boundary reject.** A step `percentComplete` outside 0–100 is
      a **422** `STEP_PERCENT_OUT_OF_RANGE` at the DTO boundary (the ADR-0042 physical-% N23 precedent),
      backstopped by the DB CHECK `ck_activity_steps_percent_complete_range`; a negative `weight` is
      likewise a boundary reject backstopped by `ck_activity_steps_weight_nonneg`.
    - **Bulk-replace is the write model (Q3).** The client sends the full desired ordered list; the server
      assigns a contiguous `seq`, reconciles (update-in-place / append / soft-delete the removed tail), and
      optimistic-locks the parent activity's `version`. A step is activity-write data (`activity:update`,
      no new permission), and the child soft-delete cascades with its activity under one `delete_batch_id`
      (the assignment/incident-edge precedent).

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
