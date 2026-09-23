# ADR-0155: A finish milestone is dated by the day it closes

- **Status:** Accepted (product owner, 2026-09-23: Q1 A, Q2 A, Q3 moot — no baselines captured)
- **Date:** 2026-09-23
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0023](./0023-cpm-scheduling-date-convention.md) §4 (the milestone rule).
  Notes against ADR-0035 §22, ADR-0125/0126 (how frozen dates are read) and ADR-0148 (how a
  placement is read).
- **Spec:** [`docs/specs/finish-milestone-date/`](../specs/finish-milestone-date/spec.md)

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
7. **~~A baseline records the rule its dates were captured under.~~ Withdrawn.** No baseline has
   been captured on the installation (product owner, 2026-09-23), so there is nothing frozen under
   the old rule to read. A baseline captured from here on freezes new-rule dates. Frozen dates are
   still never rewritten.
8. **On a time axis a finish milestone's day is one later than its date, for both of its dates**
   (`apps/web/src/lib/milestone-day.ts`). Every axis site (the canvas rect, extents, link anchors,
   the minimap, Arrange, the overlap resolver, the nudges, the Gantt diamond) goes through it, and
   every write that turns an axis day back into a stored date subtracts it. Both dates shift, not
   only the start, because every axis consumer treats a milestone as a one-day span whose start and
   finish are the same day. On a 24-hour calendar every diamond keeps its pixel (FC-8). After a
   Friday task on a Monday-to-Friday calendar it moves from Monday 00:00 back to the end of Friday,
   where the task's bar ends. `finish-milestone-day.structural.test.ts` refuses a bare
   `daysBetween` on an activity's early dates.
9. **Plans computed under the old rule are recalculated once, by the API, at boot.** The migration
   keeps every placed instant but cannot fix the engine-owned date columns: after a Friday task the
   milestone moves from Monday to Friday, which is not "one day earlier" and needs a calendar SQL
   does not have. Left alone, every finish milestone in every existing plan would draw and report
   the old date until somebody edited that plan. The status bar offers Recalculate only on a plan it
   knows is stale, so an untouched plan would stay wrong indefinitely.
   `FinishMilestoneRederiveService` therefore recalculates, as the system, each live plan that holds
   a live finish milestone and was last computed before the migration's `finished_at` (read from
   `_prisma_migrations`, so no date is written into the code). A recalculated plan is stamped with
   the present and leaves the set, so it runs once per plan. It is never awaited, never fails the
   boot, asserts no pen (nobody is editing; the write is engine-owned, ADR-0022; the plan advisory
   lock still serialises it), and is not audited (ADR-0072). No principal is constructed: the
   single-plan transaction takes the pen check as a parameter (`recalculateInLock`).

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
- Rollback after the switch is a reverse migration with the previous engine, not a bare redeploy
  (`docs/DEPLOYMENT.md`, "Rolling back past the finish-milestone date release").
- The ADR-0034 golden suite contains no finish milestone and passes unedited. So does the canvas's
  paint golden log, for the same reason, which means it gives decision 8 no coverage; the unit case
  in `render-model.test.ts` and the placement journey carry it instead.
- A migrated placement can be stored on a non-working day. A milestone the old engine read as
  Monday was placed on Monday, and the rewrite stores Sunday: the end of Sunday rolls forward to
  Monday's first working minute, the same instant. The reported date is the Friday. Correct, and
  odd-looking in the placement field.
- The paint layer's baseline, compare and levelled ghosts carry `isMilestone` and no type, and draw
  a milestone mid-day where the live diamond sits on a day boundary. That mismatch predates this
  ADR and is `docs/TECH_DEBT.md` #383.

## Corrections recorded

- **The spec never covered the stale engine-owned dates** (decision 9). The database-architect
  agent's review of the migration raised it; before that, the plan would have shipped every existing
  finish milestone drawn a day late until each plan was edited.
- **FC-5's first wording was wrong.** "No non-milestone row moves" forgot that a reinterpreted
  milestone pushes its successors, which the approved Q2 A accepts. The harness
  (`apps/api/scripts/measure-finish-milestone.mts`) checks the invariant it meant: no row moves that
  is not downstream of a dated finish milestone (by edge, WBS parent or LOE span). Result: 0.
- **The API e2e's first fixture assumed a 24-hour calendar.** A new plan takes the organisation's
  Monday-to-Friday default, so the old reading after a Friday task was Monday, not Saturday. The
  case's own assertion caught it; the fixture was corrected, not the product.

## References

- Spec, plan and conditions: [`docs/specs/finish-milestone-date/`](../specs/finish-milestone-date/spec.md).
- Migration `20260923120000_finish_milestone_end_of_day_placements`; `docs/DATABASE.md`
  "FmDateMigration"; API e2e `apps/api/test/finish-milestone-date-migration.e2e-spec.ts` (FC-6, D9).
- ADR-0023 §4; ADR-0035 §22; ADR-0037 (instants); ADR-0107 (two-release schema change);
  ADR-0125/0126 (frozen dates, capture-level discriminators); ADR-0148 (placements, recorded
  conversions).
