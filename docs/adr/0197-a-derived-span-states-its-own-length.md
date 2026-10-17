# ADR-0197: A derived span states its own length, and the engine is what measures it

- **Status:** Accepted — 2026-10-17. The spec was approved by the product owner on 2026-10-17 with the recommended
  defaults (CQ-1: Level-of-Effort is in; CQ-2: the activity's own calendar, falling back to the plan's; CQ-3: CSV and
  MSPDI carry it, XER is unchanged). Milestone 1 (engine, column, API) is built; the web surfaces (M2) and the MSPDI
  emitter (M3) follow in their own commits.
- **Spec:** [`docs/specs/wbs-summary-duration/spec.md`](../specs/wbs-summary-duration/spec.md) §4.9 · **Plan:**
  [`implementation-plan.md`](../specs/wbs-summary-duration/implementation-plan.md)
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0035](0035-schedulepoint-cpm-semantics.md) §21 and §24 by adding an output; no date and no float
  changes.
- **Builds on:** ADR-0022 (engine output is never an input column), ADR-0036 §7 and ADR-0037 §4 (the instant axis and
  the activity's own calendar), ADR-0070 (sub-day durations), ADR-0088 D1 (no flag), ADR-0089 D2b (a host resolves what
  a field group shows), ADR-0148 D3 (a quantity downstream cannot recompute is persisted).

## Context

A WBS summary's stored duration is its creation input (`0` from the XER importer) and is never written back, so a
summary printed `0 d` beside an eleven-month bar. `docs/TECH_DEBT.md` #375 withheld the figure (`—`) in two places and
recorded the real fix as unbuilt: the engine would have to write it. Re-reading the code for the spec found the same
defect on **Level-of-Effort**, which #375 never mentioned: an LOE also stores `0`, and its own unit test asserted `0 d`.

The engine already holds the span, as instants, rolled onto the activity's calendar (`compute.ts`, the LOE and
summary passes). Everything persisted downstream of it is a `DATE`, so a sub-day span cannot be recovered from the
dates (ADR-0070), and the working-time arithmetic would have to be implemented a second time outside the engine.

## Decision

**D1 — The derived duration is engine output, persisted as working minutes.** `computeSchedule` sets
`derivedDurationMinutes` on a `WBS_SUMMARY` result and a `LEVEL_OF_EFFORT` result, from the **rolled** early
start and finish the passes store (after the roll-forward and the `Math.max`), counted by the activity's own calendar
(the plan's when it has none). It is **absent** — `NULL` at the column — for a summary with no children and for an LOE
with `loeNoSpan`: both have a defined placement, which is not a measurement. A summary whose children are all
milestones is a real `0`. `writeResults` writes it in the same batch as every other engine-owned column, **for every
result**, so the `NULL` it writes is what clears an activity that has stopped being a summary or an LOE.

**D2 — It is never written into `duration_minutes`.** That column is the planner's input, read by the next
recalculation, carried by the XER/MSPDI round trip and recorded in activity history (ADR-0022).

**D3 — Every reader takes it from the field.** The API returns `derivedDurationMinutes` and `derivedDurationDays` on
every activity read and on the guest read, **gated on type** at the DTO as well as at the column: a row read between a
type change and the next recalculation never shows a task a duration it did not have. The web formats it through the
one Duration cell function (M2) and no surface re-derives it from the rolled-up dates.

**D4 — Exports.** The CSV and MSPDI carry it for the two types; XER is unchanged (a `PROJWBS` row has no duration
field, and P6 owns LOE durations on schedule). The organisation export gains the column, appended, and its format
moves to `1.1` (ADR-0194).

## Alternatives considered

- **Derive at read time from `earlyStart`/`earlyFinish`.** Loses sub-day spans, needs every calendar on every list
  read (an N+1), and is a second implementation of the arithmetic.
- **Derive in the client.** All of that, plus each of the canvas, Gantt and guest view computing it separately.
- **Write it into `duration_minutes`.** Breaks D2.
- **The plan calendar always.** The engine rolls the summary onto its own calendar; the plan's would measure a span
  the engine did not produce.
- **Sum the children.** Overlapping children double-count; a phase's duration is its span.

## Consequences

- **Parity.** The field is present only on those two result types, so a plan with neither gets a byte-identical
  `results` array. `compute.spec.ts`, `compute.visual.spec.ts` and the conformance fixtures are not edited; the new
  cases are `compute.derived-duration.spec.ts`. `level.hot-resource.parity.spec.ts` hashes whole results including
  summaries, so it drops this one key before hashing and still matches its original frozen hashes.
- **Stale until recalculated**, exactly as the summary's dates are. A plan last calculated before this shipped reads
  `—` until the next recalculation; no boot recalculation is run (spec CQ-5).
- **Children on another calendar are counted on the summary's.** A seven-day child under a Mon–Fri summary contributes
  its weekdays only; that is the calendar the engine rolls the span onto.
- **The stored value follows the drawn span.** If the rollup's treatment of a child placed later than logic changes
  (spec R-3), this figure follows it without a change here.

## References

- `docs/TECH_DEBT.md` #375 · `docs/DATABASE.md` (the column) · migration
  `20261017120000_activity_derived_duration_minutes`
