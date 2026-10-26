# ADR-0207: A milestone stays where its logic puts it, across calendars

- **Status:** Accepted
- **Date:** 2026-10-26
- **Deciders:** Product owner (spec approved 2026-10-26 with every default: Q1 A, Q2 A, Q3 A)
- **Amends:** [ADR-0035](./0035-schedulepoint-cpm-semantics.md) §12 and §22 (amendment appended there),
  [ADR-0155](./0155-a-finish-milestone-is-dated-by-the-day-it-closes.md) decisions 1, 3 and 4 and its first
  rejected alternative, [ADR-0162](./0162-a-zero-duration-task-keeps-its-date.md) decision 3 ("the instant
  is kept" becomes "the position on its own calendar is kept"). Relies on
  [ADR-0037](./0037-per-activity-calendars-and-instant-axis.md), [ADR-0034](./0034-engine-conformance-methodology.md)
  and [ADR-0161](./0161-a-cross-plan-link-is-the-same-link-in-one-plan.md).
- **Spec:** [`docs/specs/milestone-cross-calendar/`](../specs/milestone-cross-calendar/)
  (`docs/TECH_DEBT.md` #539)

## Context

Construction plans put a weekend or shift shutdown on its own calendar and end it with a finish
milestone before weekday work resumes. The engine snapped every zero-duration activity onto its own
calendar in both passes (`compute.ts`: forward to the next working minute, backward to the last working
end boundary), so across calendars the milestone was wrong whichever calendar it was given. The row's
fixture, run on 2026-10-22: a milestone on the weekday plan calendar read Friday, the day before the
weekend work started, and charged that work -1,440 minutes; on the weekend calendar it pushed the
weekday work after it a week; only on an all-minutes calendar, where nothing can be snapped, was it right.
A start milestone and a zero-duration task have the same late-pass fault. ADR-0155 decided how a finish
milestone is dated on one calendar and rejected keeping the predecessor's instant because a 24-hour lag
would then move successors; it did not consider a predecessor on another calendar.

## Decision

**D1. A zero-span activity keeps the instant its logic gives it, in both passes.** Zero-span is zero input
duration and not a Level-of-Effort or WBS summary (`isZeroSpan`): a start milestone, a finish milestone
and a zero-duration task alike, because the fault is the zero span and not the type. Forward (Pass 1 and
Pass 2), its start and finish are its binding lower bound as an instant; backward, its late finish and
start are its binding upper bound. The one exception is the data date FLOOR with nothing driving the activity, which still rolls onto its
calendar so a free-standing milestone does not move; a link whose bound is exactly the data date is a
driver and its instant wins (`compute.ts` tracks the latest link bound, in both forward passes). Its neighbours still roll onto their own
calendars, so `A → M → B` schedules `B` as `A → B` does. A lag is measured on the calendar its edge
resolves to, from the kept instant; on the milestone's own calendar this equals the rolled anchor
(`edge-bounds.lag-anchor.spec.ts`, measured on 5-day, 24-hour, night-shift and holiday calendars). The
driving flag reads both sides at their position on the successor's calendar, and the levelling overlay
(`level.ts` link push and milestone short-cut) keeps the instant too. The project finish date still ranks
zero-span activities at the position they were ranked at before, rolled, so the tie-breaks of ADR-0035 §22
are unchanged.

**D2. A date given for a finish milestone is midnight at the end of that calendar day, not rolled.** A
placement, constraint, external date and cross-plan read all go through `finishMilestoneDateInstant`. On
the milestone's own calendar this is zero working minutes from the old reading; it differs only to another
calendar, which is the defect. A placed finish milestone reads back the day typed (a Sunday placement reads
Sunday), and a timed value is the instant it names.

**D3. How a finish milestone is dated.** If its instant starts a working minute on its own calendar, by the
day of the working minute before it (ADR-0155 decision 1); otherwise by the day of the real minute before
it; never earlier than the data date. Its late dates are never read before its early date while its float
on its own calendar is not negative. A start milestone and a zero-duration task keep the day their next
working minute opens.

**D4. The cross-plan derivation reads what the engine does.** It stops rolling a zero-duration remote's
late date back. A remote finish milestone's early read is the end of that day's last working minute on its
calendar (midnight on a day with no working time); its late read is midnight at the end of the day.

**D5. Existing plans are recalculated once, at the first boot.** `MilestoneRederiveService`, keyed on a
comment-only marker migration `20261026120000_milestone_cross_calendar_marker`
(`docs/DATABASE.md` "Re-derivation markers"). A plan is pending when it holds a zero-span activity or
is an endpoint of a live cross-plan link whose other end is one: the second arm is needed because an
upstream plan's outgoing link to a milestone reads a different late bound now.

**D6. Rolling back deletes the marker row** (`docs/DEPLOYMENT.md`), or a later roll-forward skips every
plan the previous image touched.

## Alternatives considered

- **D1 only (Q1 B).** Fixes the float and the week, keeps ADR-0155's labels. Rejected: the milestone on
  the plan calendar still reads Friday and the week-long push stays reachable through its own dates.
- **Roll only when a neighbour is on another calendar.** The answer would depend on which neighbour is
  examined, and an elapsed lag crosses calendars inside one.
- **Keep the instant for the successor's bound but roll for the lag anchor (Q2 B).** Viable; costs a
  second anchor per milestone. Not chosen: it keeps a second rule alive for a case Q2 A accepts.
- **A rule version on each baseline (Q3 B).** A schema change; not chosen, see Consequences.

## Consequences

- Seven visible changes, listed in the changeset: the milestone reads the Sunday the weekend work ends;
  weekday work after it starts the next working morning; the weekend work carries no float it did not
  earn and the work before it has the float it has; a Friday placement after Sunday work is flagged early;
  a constraint or placement on a weekday milestone no longer pushes a weekend successor a week; a
  migrated Sunday placement reads Sunday where it read Friday; and, in a single-calendar plan, a
  successor of a finish milestone after an elapsed lag can start earlier (Q2 A).
- **Baselines show the correction as variance** on affected milestones and their neighbours: frozen
  dates are never rewritten (ADR-0155 decision 7, ADR-0125/0126) and a baseline records no rule version
  (Q3 A). The changelog says so.
- The cross-plan twin is plain `it` in every one of its 1,728 cells; a weekend calendar is not in the
  twin, so the row's own fixture is not split across plans anywhere (`docs/TECH_DEBT.md` #555).
- The frozen levelling hashes, the legacy levelling copy, one redundant-link counterexample and one
  hand-derived cross-plan golden were replaced, each diffed against the parent commit first.
- A plan restored from the recycle bin keeps its old `schedule_computed_at`, so it is pending at the
  next boot, like the three earlier re-derivations.

## References

- `docs/specs/milestone-cross-calendar/feature-spec.md` and `implementation-plan.md`
- `apps/api/src/modules/schedule/engine/` (`compute.ts`, `instants.ts`, `constraints.ts`, `level.ts`,
  `apply-levelling.ts`), `cross-plan-derivation.ts`, `milestone-rederive.service.ts`
- `apps/api/scripts/measure-milestone-cross-calendar.mts` (the movement harness)

## Verification ledger: mutations the new tests were killed by

Each row is a change made to the code, the spec it turned red, and the restore that turned it green. All
were run on 2026-10-26 against the tree at the commit that added the test.

| Mutation                                                                              | Red in                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pass 1 keeps the instant unless it equals the data date (the first draft's rule)      | `compute.activity-calendar.spec` "driven to exactly the data date" |
| Pass 2 the same                                                                       | the same case                                                      |
| Pass 1 rolls every zero-span activity (D1 off, forward)                               | `compute.milestone-instant.spec`: 6 cases                          |
| The backward pass rolls every zero-span activity (D1 off, backward)                   | `compute.milestone-instant.spec`: 4 cases                          |
| The late date of a finish milestone is lifted to its early date whatever the float    | the negative-float case                                            |
| `rankInst` removed from the project-finish ranking                                    | "a zero-duration task ... outranks a finish milestone"             |
| The date reader rolls onto the milestone's calendar again (D2 off)                    | `compute.finish-milestone.spec`: FNLT, FNET and placement cases    |
| `leveledDate` reads the working-minute offset again                                   | `level.milestone-cross-calendar.spec` plan-calendar case           |
| The levelling link push rolls a zero-span activity                                    | `level.milestone-cross-calendar.spec` first case                   |
| `targetDateFor` reports `placed > levelled` again                                     | `apply-levelling.spec` Friday-close case                           |
| Remote finish milestone early read is always midnight                                 | `cross-plan-derivation.spec` eight-hour Friday cell                |
| Remote finish milestone early read ignores the dated day                              | the eight-hour holiday cell and the Sunday cell                    |
| The late read is the last working minute                                              | "FS into an eight-hour finish milestone"                           |
| Pending query: outgoing arm dropped                                                   | `milestone-cross-calendar.e2e-spec` main case                      |
| Pending query: incoming arm dropped                                                   | the same case (the INCOMING_ONLY plan)                             |
| Pending query: LOE and summary counted as zero-span                                   | the main case and the hammock assertion                            |
| Pending query: `deleted_at` dropped on `plans`, on `activities`, on the outgoing link | the main case, each                                                |
| Pending query: the milestone-type disjunct dropped                                    | "a milestone stored with a non-zero duration"                      |

The `check:engine-parity` gate is skipped (no declaration file exists) and this change declares none: the
engine change is the subject, and its parity evidence is the golden and conformance suites, the cross-plan
twin, and the movement harness's classified diff (`scripts/measure-milestone-cross-calendar.mts`).
