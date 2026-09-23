# ADR-0155 (draft): A finish milestone is dated by the day it closes

> **Draft.** Lives beside its spec until the product owner approves it. On approval it moves to
> `docs/adr/0155-a-finish-milestone-is-dated-by-the-day-it-closes.md` (re-check the number first:
> ADR-0079 records a number being taken between a plan and its filing).

- **Status:** Proposed
- **Date:** 2026-09-23
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0023](../../adr/0023-cpm-scheduling-date-convention.md) §4 (the milestone rule).
  Notes against ADR-0035 §22, ADR-0125/0126 (how frozen dates are read) and ADR-0148 (how a
  placement is read).
- **Spec:** [`./spec.md`](./spec.md)

## Context

ADR-0023 §4 prints a zero-duration milestone at its start instant, so a finish milestone "reads one
calendar day later than a task ending at T". Three things were not costed when that was decided:

1. **It is not one day.** The engine rolls a milestone forward to the next working minute
   (`compute.ts:254`) and prints that minute's day (`compute.ts:109-115`, `:846-849`). After a task
   ending Friday on a Monday–Friday calendar the milestone reads Monday; the engine's own test
   expects exactly that (`compute.zero-task.spec.ts:51-63`).
2. **Inputs are read the same way.** A placement is the start of its day (`compute.ts:336-339`), so a
   finish milestone dragged onto its predecessor's last day is flagged as placed earlier than logic
   allows (`compute.ts:346`). A constraint on any zero-duration activity is the start of its day
   (`constraints.ts:111-114`), so `FNLT 30 Apr` after work ending 30 Apr gives one day of negative
   float. The NetPoint reference seed had to place every finish milestone on the next day to avoid
   the conflict.
3. **The product is compared with P6 and NetPoint**, which print a finish milestone on its
   predecessor's finish date. The reference plan's Guaranteed Commercial Operation reads 01 Mar 2031
   in our status bar and 2/28 in the picture (`docs/TECH_DEBT.md` #381). Actual finishes are already
   read at the end of their day (`progress.ts:91-97`), so the engine was reading a finish
   milestone's actual date one way and its planned date the other.

## Decision

1. **A `FINISH_MILESTONE` is dated by the day whose working time ends at its instant** — the day of
   the last working minute before it, exactly as a task's finish is read. This applies to its early,
   late and placed dates, and so to the project finish when it carries it.
2. **It never reads earlier than the data date.** Without this floor an open-start finish milestone
   would read the day before the data date.
3. **Every date given for a finish milestone means the end of that day** — its placement, its
   constraints of any kind, and its external dates. The date you type is the date you read back.
4. **Engine instants are not changed.** Only the two conversions at the engine's edge change. Pass 1
   is byte-identical for every activity except finish milestones that carry a constraint or an
   external date, whose inputs now mean the end of their day.
5. **`START_MILESTONE` and zero-duration `TASK` are unchanged.**
6. **Existing placements are re-encoded one day earlier** in the release that switches the rule, so
   every placed finish milestone keeps its instant and its diamond; only its label moves. The rows
   rewritten are recorded so the change can be reversed exactly.
7. **A baseline records the rule its dates were captured under**, and every reader reads a frozen
   date under its own rule. Frozen dates are never rewritten.
8. **The web draws a finish milestone's diamond at the end of its date**, and converts a drop
   position back to a date with the inverse of the same helper. On a 24-hour-day calendar every
   diamond keeps its pixel position.

_(Decisions 3, 6, 7 are subject to the product owner's answers to spec §6 Q2, Q1, Q3; this draft
records the recommended defaults.)_

## Alternatives considered

- **Move the engine instant to the predecessor's pre-gap finish.** Working-offset outputs would not
  change, but lag walked on a different lag calendar would: a `TWENTY_FOUR_HOUR` lag from Friday
  17:00 and from Monday 08:00 land on different days. Rejected — a label change must not move
  successors.
- **Read "end of day" or "start of day" by which bound binds (finish-side or start-side).** Closer to
  a tool that keeps clock times. Rejected: a second state per activity, a tie rule, and an
  open-start milestone could show its late date before its early date with zero float.
- **Web-only shim.** Rejected: the API, exports, health check and share view would disagree with the
  canvas, and the false conflict is in the engine.
- **Keep ADR-0023 §4 and document it.** Rejected: leaves a false conflict and a false negative float
  a planner can hit, and a workaround the product owner asked to remove.

## Consequences

- Finish milestones match P6 and NetPoint for the common case (a milestone closing work).
- A finish milestone placed on its predecessor's last day is not a conflict; `FNLT` on that day
  gives zero float.
- The project finish can move one or more calendar days earlier on any plan whose finish is carried
  by a finish milestone. On the seed catalogue this is predicted for the torture plan
  (`2027-03-12 → 2027-03-11`) and the NetPoint plan (`2031-03-01 → 2031-02-28`); M0 measures both.
- Finish milestones with a constraint or external date move to the end of that day's working time.
  The torture plan's `A10500` mandatory finish moves from the start of 16 Oct to its end, which is
  where P6 pins it (`activities.csv:112`, `18:00`).
- A finish milestone with a start-type input (`SNET`, external early start) sits at the end of that
  day, which is later than a clock-time tool would place it. Recorded, not hidden.
- A finish milestone and a zero-duration task at the same instant no longer print the same date;
  ADR-0035 §22's "date-neutral" note stops being true.
- Legacy baselines compare exactly for whole-day finish milestones and can be one working day out
  for one that sat mid-day; the comparison says so.
- Rollback after the switch is a reverse migration with the previous engine, not a bare redeploy.
- The ADR-0034 golden suite contains no finish milestone and passes unedited.

## References

- Spec and plan: [`./spec.md`](./spec.md), [`./implementation-plan.md`](./implementation-plan.md).
- ADR-0023 §4; ADR-0035 §22; ADR-0037 (instants); ADR-0107 (two-release schema change);
  ADR-0125/0126 (frozen dates, capture-level discriminators); ADR-0148 (placements, recorded
  conversions).
