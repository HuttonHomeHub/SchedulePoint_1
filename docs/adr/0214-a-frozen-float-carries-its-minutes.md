# ADR-0214: A frozen float carries its minutes

- **Status:** Accepted. It ships with its implementation (`docs/TECH_DEBT.md` #318, plan tasks T1 to T6).
- **Date:** 2026-11-08
- **Deciders:** Product owner (spec approved 2026-11-08: float stored in minutes from now on, baselines
  from before the release show "Float movement unknown"; every plan is wiped at 1.0, so no investment in
  old baselines) and Claude Code (feature-analyst, database-architect for the columns).
- **Spec:** [`docs/specs/baseline-float-frame/feature-spec.md`](../specs/baseline-float-frame/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/baseline-float-frame/implementation-plan.md). Closes
  `docs/TECH_DEBT.md` #318.
- **Amends:** [ADR-0068](./0068-calendar-hours-per-day.md) §5, whose "a later calendar edit must not rewrite
  what this baseline reports as its float" held for the stored figure and not for the comparison, and
  [ADR-0194](./0194-an-organisations-export-is-a-promised-format-streamed-on-the-request.md) (format 2.5,
  two appended columns).
- **Builds on:** ADR-0025 (a baseline is a snapshot copy), ADR-0125 (an unknown is never agreement),
  ADR-0126 (the change list), ADR-0127 (an overlay counts what it does not know), ADR-0132 (a standing
  condition is text, not an announcement), ADR-0088 D1 (no flag).

## Context

`total_float` is `Math.round(minutes / factor)` on the activity's own calendar, and the minutes were thrown
away. A baseline therefore froze a number that cannot be re-framed: after a calendar's hours-per-day
changes, a float that did not move reads as moved (`round(2400 / 1440) = 2` against 5 at 480). Four
surfaces subtracted two such numbers and reported the difference as schedule change: the activities
table's "Total float variance", the entered and left rows of Compare revisions (and their ordering), the
printed comparison, and the change list's "Criticality changed" class, which fired on the float half
alone. Start and finish variance were not affected: each divides one working-time span by one frozen
factor. Float was the only comparison that subtracted a number framed on one side's day lengths from one
framed on the other's.

The register row described a per-baseline frame marker. Reading the code corrected it: the plan
calendar's factor is already frozen per baseline (`baselines.hours_per_day_minutes`), but an activity's
float is rounded on its own calendar, which a per-baseline marker cannot describe, and no marker undoes
the rounding.

## Decision

**D1. The recalculation stores the float in minutes beside the day figure, and capture copies it.**
`activities.total_float_minutes` and `baseline_activities.total_float_minutes`, nullable `INTEGER`, the
engine's unrounded `totalFloat`. Written by `writeResults` as the last `unnest` argument (so the
positional indices other cases pin do not move) and by capture verbatim. The engine is untouched.

**D2. Every float comparison subtracts minutes and converts once, on the earlier revision's plan
working day.** Variance, the revision delta (same-plan and cross-plan), its entered and left ordering and
the "Criticality changed" predicate. That day is the factor the finish movement beside it already
divides by, so every number on a screen agrees. The change list compares whole days on that frame rather
than raw minutes, which keeps today's sensitivity and guarantees a listed row's two labels differ.

**D3. NULL minutes beside a set day figure mean "not comparable", inferred from NULL.** There is no
capture discriminator and no plan-level mirror, which departs deliberately from the `*_snapshot_level`
rule: every plan is wiped at 1.0, and after the release the only source of the first state is a plan not
recalculated since. A one-way CHECK keeps minutes from existing without days. The rule is written once,
in the column comments.

**D4. A row that cannot be compared is counted and stated, never rescaled, never read as zero.** Its
movement is `null`; `floatNotComparableCount` counts matched non-summary activities whose float was
calculated on both sides with minutes missing on one (a float never calculated is not counted: the
existing "unknown" handling already says why); the panel, the print and the change list show a quiet
note, and only when the count is above zero. It is a standing condition, so it is page text and is never
announced.

**D5. Float reads "Float down 2 days (16 h)".** Days are counted on the earlier revision's plan working
day with the exact hours beside them. "Float unchanged" is exactly zero minutes; a movement under half a
day reads in hours alone ("Float down 4 h"); no minutes reads "Float movement unknown".

## Alternatives considered

- **A. A footnote only, B. a verdict computed from stored data with a caveat on every screen.** Cheap and
  schema-free, and they protect only baselines that the 1.0 wipe removes. Dropped.
- **D. A per-baseline frame marker** (the register row's sketch). The plan factor is already frozen; the
  marker cannot describe a per-activity calendar and the days stay rounded. Rejected.
- **E. Freeze each activity's factor.** Same cost as C and strictly less information. Rejected.
- **F. Rescale the frozen days.** Impossible: the rounding destroyed what a rescale needs.
- **G. Drop the float half of "Criticality changed".** Loses a real signal ADR-0126 added and does nothing
  for variance. Rejected.

## Consequences

- The organisation export gains two columns (format 2.5, a minor change; ADR-0194 amended).
- ADR-0068 §5 is amended in place: a baseline reports float as frozen minutes, and what a comparison
  reports no longer depends on a day length edited afterwards.
- A baseline captured before the release, and a live plan not recalculated since, show "Float movement
  unknown" and the note. Recalculating clears the live side; old baselines cannot be fixed and go at the
  1.0 wipe.
- The activities table derives its "N could not be compared" header line from the variance rows it holds,
  by the same rule the server counts with (`isFloatNotComparable`), rather than receiving the count as a
  new prop. If the rule changes, both change.
- `isNearCritical` also depends on the day factor (`compute.ts`, #522). It is neither frozen nor compared,
  so it is out of scope here and recorded rather than changed.
- Free float, remaining float and visual drift stay in days: nothing compares them across baselines.
- Guests see no baseline surface, and `totalFloatMinutes` joins the forbidden guest keys.
