# ADR-0203: Re-layout starts from several places and may use the rows the diagram already has

- **Status:** Accepted — 2026-10-18. The spec was approved by the product owner on 2026-10-17 and **amended on
  2026-10-18** (CQ-2, below). Milestones 0 to 2 are built; M3 is not built (D5).
- **Spec:** [`docs/specs/relayout-quality/spec.md`](../specs/relayout-quality/spec.md) §4 · **Plan:**
  [`implementation-plan.md`](../specs/relayout-quality/implementation-plan.md) · **Measurements:**
  [`m0-reading.md`](../specs/relayout-quality/m0-reading.md),
  [`m2-verdict.md`](../specs/relayout-quality/m2-verdict.md)
- **Date:** 2026-10-18
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0152 decision 1's budget sentence, decision 3 and decision 4, for Re-layout only. Tidy is unchanged
  and byte-identical (FC-R8).
- **Builds on:** ADR-0069 (`packLanes`), ADR-0149 (readability before rows), ADR-0151, ADR-0159 (the router both
  options score through), ADR-0066 (the seed catalogue), ADR-0128 and ADR-0142 (measure before building), ADR-0088 D1
  (no flag).

## Context

`docs/TECH_DEBT.md` #382: on the NetPoint reference plan, Re-layout reached 11 rows and 9 crossings with one overlap
where a hand layout has 14 rows and 1 crossing. M0 separated two causes by measurement: the search was held to the
fewest rows time allows, so it could not spend a row, and it began from one construction (the time-ordered pack), so
it could only improve that picture.

## Decision

**D1. Re-layout may use as many rows as the diagram has now** (the taller of the diagram and the pack). Spending a row
to clear touching glyphs, hidden links and crossings is what ADR-0149 already ranks first.

**D2. Re-layout searches from up to four starts and keeps the best**: the pack (today's), a chain-rows start, a
depth-first pack and an unhinted pack, in parallel module workers. Which starts run depends on the drawn count alone,
never on the machine, so two planners pressing the button get the same diagram (FC-R7).

**D3. The starts run on plans of up to 150 drawn activities (`RELAYOUT_MULTISTART_MAX_ACTIVITIES`); above it
Re-layout searches from the pack start alone**, as M1 did. This **replaces** the approved CQ-2 bar (within 1.5x
today's wait at 300 activities): measured, the wait stays within 1.5x only up to about 10 activities and is 3.4x to
4x at 100 to 150 and 3.3x at 300, so that bar would have withheld the starts from every plan worth pressing Re-layout
on. The owner decided on 2026-10-18, having seen the reference-plan pictures, and confirmed when re-asked.

**D4. The owner accepted FC-R5 firing knowingly.** On `fixture-p6-torture-v1` (147 drawn, inside the limit) Re-layout
now spreads the plan from 24 to 35 rows (max abs(dlane) 16 to 28). The before and after pictures are committed
(`docs/specs/relayout-quality/pictures/`).

**D5. M3 (chain and row moves) is not built.** The plan builds it only if M2 misses FC-R3, and FC-R3 passes.

## Measured result (m2-verdict.md, gate 150)

| Plan      | Crossings today / hand / candidate | Rows today / candidate | Wait today / candidate    |
| --------- | ---------------------------------- | ---------------------- | ------------------------- |
| Reference | 9 / 1 / 1 (overlaps 1 / 0 / 0)     | 11 / 14                | about 0.3 s / about 3.6 s |
| Fixture   | 171 / 1 / 119 (at the gate 300)    | 24 / 35                | about 5 s / about 28 s    |

FC-R1 to FC-R4, FC-R7 to FC-R9 pass; FC-R5 fails on the fixture (D4); FC-R6 is superseded by D3.

## Alternatives

Keep CQ-2 as written (gate 10): ships M1's lever only and FC-R3 and FC-R4 fail. Gate 60, which fits the reference plan
only: declined by the owner for 150. Gate 300: 90 s at the top, rejected. A ranked critical-path term (CQ-3): not taken,
reported only.

## Consequences

Re-layout on a plan of about 100 to 150 activities waits tens of seconds, cancellable. A planner on fewer cores waits
longer (the pool is `min(starts, max(1, cores - 1))`); the diagram is the same. A freshly imported plan gains nothing
from D1, because its rows already are a pack. `docs/TECH_DEBT.md` #382 is closed with the hand layout reached on the
reference plan.
