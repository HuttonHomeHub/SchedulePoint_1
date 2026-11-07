# ADR-0212: A plan keeps the instant beside the date, and a cross-plan link reads it

- **Status:** Proposed
- **Date:** 2026-11-07
- **Deciders:** Product owner (spec approved 2026-11-07: Q1 B, milestones and part-day finishes both;
  Q2 A, linked plans recalculated once at first start)
- **Amends:** [ADR-0161](./0161-a-cross-plan-link-is-the-same-link-in-one-plan.md)'s parity domain (the
  zero-span edge, and the sub-day edge under Q1 B) and [ADR-0045](./0045-live-cross-plan-programme-scheduling.md)
  §2 (the derivation reads persisted instants where present). Notes against
  [ADR-0022](./0022-cpm-execution-and-persistence-model.md) (a new class of engine-owned output),
  [ADR-0194](./0194-an-organisations-export-is-a-promised-format-streamed-on-the-request.md) (format 2.4),
  [ADR-0207](./0207-a-milestone-stays-where-its-logic-puts-it.md) D3/D4 (dates unchanged; the cross-plan
  read of a remote no longer goes through them) and
  [ADR-0148](./0148-visual-is-the-plan.md) M-H (basis unchanged).
- **Spec:** [`docs/specs/cross-plan-instants/`](../specs/cross-plan-instants/)
  (`docs/TECH_DEBT.md` #565)

## Context

ADR-0161 made a cross-plan link produce the dates the same link produces inside one plan, to the minute,
for everything the link arithmetic controls, and named what it left outside. One of those edges is a
zero-span activity (a start milestone, a finish milestone, a zero-duration task): the plan keeps the exact
instant its logic gives it, but **stores only the day**. The day is not enough. The fixture split across
two plans (`cross-plan-milestone-fixture.spec.ts`, run 2026-11-07, `docs/specs/cross-plan-instants/m0/red-run.md`)
shows five of 24 cases a week off: a driven and an SNET-pinned weekend start milestone both store
`2027-07-03` while the work after it starts `2027-06-28` against `2027-07-05`; a successor-driven and an
FNLT-constrained weekday finish milestone both store late `2027-07-02` while the work before it has `1440`
minutes of float against `0`. No reading of the stored date is right for both, so no cleverer reader can
close it. Every one is pessimistic: the split programme looks later or tighter than the same logic in one
plan. The sixth case is the upstream plan's own finish basis and is not a storage fault.

The engine already holds the exact instants where it builds the result (`compute.ts`:
`placedStartInst`, `placedFinishInst`, `lsInst`, `lfInst`), and its clamps already read a timed value as an
instant. What is missing is the remote plan keeping them, and the plan across the link reading them.

## Decision

**D1. The engine reports the instants it dates from.** `EngineResult` gains four required in-memory fields,
`placedStartInstant`, `placedFinishInstant`, `lateStartInstant`, `lateFinishInstant` (absolute minutes on the
engine's axis): the instants `visualEffectiveStart/Finish` and `lateStart/lateFinish` are dated from. No
engine input changes and no existing field changes. The offsets cannot stand in: they are projected onto the
plan calendar, which is lossy for an activity on another calendar.

**D2. A recalculation persists them beside the dates, in the same statement.** Four engine-owned columns on
`activities`, written by `writeResults` only, never accepted from a DTO, never touching `version`. Their
design (types, the freshness marker's home, no backfill, no index) belongs to the database-architect
(CLAUDE.md §19.3) and lands in the schema milestone. _This ADR's first milestone ships D1 and D3 only._

**D3. The derivation uses a current instant, else reads the date as before.** An incoming edge carries the
predecessor's placed instants and an outgoing edge the successor's late instants, each `number | null`. A
non-null instant is the bound's anchor, unread and unrolled, for every remote type (Q1 B: one rule with no
type branch, which is ADR-0161's own principle); a null one reads the date exactly as the code always has.
Nothing else changes: the bound functions, the composition with the hand-entered column and the formatter
are ADR-0161's. Both producers of an edge move together (the service and the conformance adapter), and
`cross-plan-basis.structural.spec.ts` pins that.

**D4. An instant from an older run is never read.** A freshness marker written in the same transaction as
`schedule_computed_at` tells the reader whether a remote plan's instants were written by the run that wrote
the dates beside them; the service passes null for one that does not match. After a rollback an older image
advances the dates without the instants, and the reader falls back to the date by itself, with no operator
step to remember (ADR-0058).

**D5. Linked plans are recalculated once at first start** (Q2 A), upstream first across the whole
organisation graph, keyed on a comment-only marker migration that ships with the switch that turns the
read on, in the shape of ADR-0155 D9, ADR-0161 D8 and ADR-0207 D5.

**D6. The fallback is counted.** `deriveExternalInstants` reports `remoteInstantMissingCount`, the edges
whose remote had a date and no instant, excluding LOE and never-calculated remotes; the service logs it when
non-zero. It is the population the residual debt row's trigger reads.

**D7. The upstream plan's own finish basis stays.** A finish milestone on the weekend calendar, cut at
`M → K`, whose late date reads Sunday across plans and Monday in one plan, is the upstream plan computing
about itself: its backward pass starts from its own project finish, which a downstream bound can only
tighten. No stored value changes it, any end activity of an upstream plan takes its plan's finish, and it
affects the late date's label and not the float. Changing it would change every linked upstream's float
basis (ADR-0045), with no report asking. It stays an expected failure, re-labelled "by design".

**D8. The organisation export carries the columns, appended, as format 2.4** (ADR-0194), with the marker
withheld if it is a `plans` column. XER and MSPDI are untouched: both write inputs, not computed dates.

## Parity

`computeSchedule` is byte-identical for every input and every existing output field: a comparison over 15,588
engine runs (the conformance scenarios and goldens, the cross-calendar fixture's six middles, and the twin
matrix's three plans per cell on both axes) was identical field for field with the four new fields removed.
A plan with no cross-plan edge never reaches the derivation, so its engine input is byte-identical. A plan
whose remote ends have no current instant builds a byte-identical engine input. A plan whose remote ends have
current instants changes deliberately and only toward the one-plan answer: the five cases and the sub-day
cases.

## Consequences

- Linked dates move earlier and float returns, never the reverse, in the closed cases. The one exception is
  a hand-placed finish milestone upstream, which reads the end of the typed day as one plan's Pass 2 does;
  it is outside ADR-0161's parity domain and is reported when it moves.
- One more boot service, the fifth of its kind. Rollback deletes the marker row (ADR-0207 D6) and needs
  nothing else because of D4.
- The remaining parity edges are placed upstreams and progress-mode tie dropping (ADR-0161).
- Until the schema milestone lands, production passes `null` for every remote instant and nothing a planner
  sees changes. Status stays Proposed until the read is switched on and measured.

## Alternatives considered

| Alternative                                                             | Verdict       | Why                                                                                                                                |
| ----------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A cleverer date reader (the last working end boundary)                  | Rejected      | The two instants above store one date, so no reading of it is right for both.                                                      |
| Persist the plan-frame offsets the engine already reports               | Rejected      | Projected onto the plan calendar and lossy for another calendar: the information this change exists to keep.                       |
| Persist only zero-span instants                                         | Rejected      | A type-conditional column, wrong after a type change until recalculated, and no cheaper; Q1 is decided at the read, not the write. |
| Persist all six (the early pair too)                                    | Rejected      | No reader: the forward basis is placed (ADR-0148 M-H). Add when one exists.                                                        |
| Recompute the remote plan in memory during the downstream recalculation | Rejected      | Runs another plan's engine inside this plan's transaction and lock and reverses ADR-0045 §2's "read persisted dates".              |
| Change the third shape                                                  | Rejected here | A different decision about per-plan float basis, with no report asking for it.                                                     |
| Rollback safety by a documented null-out step instead of D4             | Not preferred | Depends on an operator remembering; ADR-0058.                                                                                      |
| A `VITE_` flag                                                          | Rejected      | No web change, and a build-time flag is not a rollback here (ADR-0088 D1). The rollback is a commit boundary plus D4.              |
