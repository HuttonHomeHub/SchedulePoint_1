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

| Clauses                            | Owning milestone | Status       |
| ---------------------------------- | ---------------- | ------------ |
| §1–§6 (progress & the data date)   | M2               | **Accepted** |
| §7–§11 (constraints), §12 (N15)    | M4               | **Accepted** |
| §13–§14 (duplicate/cycle report)   | M4 (F8)          | **Accepted** |
| §22 (zero-duration task)           | M4               | **Accepted** |
| §17–§20 (float & critical)         | M6               | **Accepted** |
| §21, §23–§24 (LOE, resource, WBS)  | M5-epic          | Proposed     |
| §15–§16, §25 (arithmetic/boundary) | M0/M1            | Proposed¹    |

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

### Activity types (→ M1/M5)

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
    a milestone's non-zero duration to zero** with a warning (N17).

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
