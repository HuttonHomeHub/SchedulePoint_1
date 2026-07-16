# ADR-0024: Working-day calendars (model, engine integration & scope)

- **Status:** Accepted (amended by ADR-0036)
- **Date:** 2026-07-10
- **Deciders:** James Ewbank (with Claude Code)

> **Amended by [ADR-0036](0036-hour-granular-calendars-and-durations.md) (M1):** the weekday-mask +
> whole-day-exception model is replaced by intraday **shift windows** + time-window exception ranges;
> the O(log) week-arithmetic + binary-search calendar port survives at minute granularity.
>
> **Superseded in part by [ADR-0037](0037-per-activity-calendars-and-instant-axis.md) (M5):** §4's
> deferral of **per-activity** calendars is lifted — the reserved `activities.calendar_id` is activated
> and each activity schedules on its own resolved calendar port (the engine moves to an absolute-instant
> axis); the org calendar library + per-plan default described here are otherwise unchanged.

## Context

The CPM engine (M6, ADR-0022/0023) schedules in **working-day offsets** from the
data date and maps them to calendar dates through the `WorkingDayCalendar` **port**
(`addWorkingDays` / `workingDaysBetween`). M6 shipped with the only implementation
being **all-days-work** — every calendar day counts as a working day — so computed
dates fall on weekends and holidays, which no construction team can use. ADR-0023
§5 anticipated this: "M5 (Calendars) supplies a real calendar (weekends, holidays,
per-activity calendars) behind the **same port with no change to the engine**."

M5 must decide: **what a calendar is**, **how it plugs into the engine**, **who a
calendar belongs to and what it applies to**, and **what happens to existing plans**
— on a top-risk feature where off-by-one day-math "erodes planner trust"
(PROJECT_BRIEF §17), across plans that can hold thousands of activities (the M6 perf
NFR: < 500ms @ 500, < 2s @ 2,000).

## Decision

1. **Calendar model — a weekly pattern + dated exceptions.** A calendar is a
   **7-bit weekday mask** (`working_weekdays`, bit 0 = Monday … bit 6 = Sunday; must
   be non-zero) plus a list of **dated exceptions** each carrying an `isWorking`
   flag. `isWorking: false` is a **holiday** (a normally-working weekday made
   non-working); `isWorking: true` is a **working exception** (a normally-non-working
   day made working, e.g. a worked Saturday). One flag expresses both directions at
   near-zero extra cost. Dates are strict `YYYY-MM-DD`.

2. **Engine integration — a pure factory at the existing port; the engine is
   unchanged.** A pure, dependency-free `buildWorkingDayCalendar(workingWeekdays,
exceptions)` (in `schedule/engine/calendar.ts`) returns a `WorkingDayCalendar`.
   `ScheduleService.recalculate` loads the plan's calendar, builds the port
   implementation, and hands it to `computeSchedule` at the existing
   `ComputeOptions.calendar` seam. **The engine's pass code does not change** —
   exactly the seam ADR-0023 promised.

3. **Performance contract — O(1) week arithmetic + O(log H), never a day loop.**
   `compute.ts` calls the port ~4× per activity over potentially multi-year spans,
   so a day-by-day scan would blow the recalc NFR. `workingDaysBetween` counts
   working weekdays by closed-form week arithmetic and adjusts for exceptions via
   binary search over a sorted array (`H` = exception count). `addWorkingDays` is a
   **monotonic binary search over that one counting primitive**, which keeps the
   whole off-by-one surface in a single, differentially-tested function. Its
   correctness is pinned by two properties: the inverse invariant
   `workingDaysBetween(from, addWorkingDays(from, n)) === n` for all `n`, and a
   **differential test against a naive day-by-day reference** over ±400 days.

4. **Scope — an org calendar library + a per-plan default. Per-activity is
   deferred.** Calendars are an **org-scoped, reusable library**; a plan carries a
   nullable **default calendar** (`plans.calendar_id`). Each org is seeded a
   **Standard (Mon–Fri)** calendar; new plans default to it. **Per-activity
   calendars are deliberately deferred** — see below. The reserved
   `activities.calendar_id` column stays reserved (no schema churn).

5. **Back-compat — a null plan calendar is all-days-work.** A plan with no
   `calendar_id` schedules **exactly as in M6** (`allDaysWorkCalendar`), so existing
   plans and the M6 golden suite are unaffected until a planner opts in and
   recalculates. Recalculation is an explicit action, so calendars never change a
   plan's dates silently.

## Alternatives considered

- **Per-activity calendars now (a literal reading of ADR-0023 §5).** Attractive
  (crews on different shifts), but it **breaks the engine's continuous-offset
  arithmetic**: the relationship bounds (`ES_s ≥ EF_p + L`, etc.) add integer
  **working-day offsets** that are only meaningful if predecessor and successor
  share one calendar — offset `k` must name the same calendar date on both ends of
  an edge. With different calendars per activity, an offset no longer maps to a
  single date, so lag and the max/min bounds are ill-defined without converting to
  a common axis (calendar days) inside the pass. That is a **real engine change**,
  not a port swap, and needs its own ADR (a canonical calendar-day axis + per-edge
  conversion). Deferred; the reserved column keeps the door open.
- **Rich recurrence (RRULE-style patterns, shift rosters).** Over-engineered for
  v1; a weekly mask + dated exceptions covers weekends, public holidays, and
  worked-weekend one-offs — the cases planners actually enter. Additive later.
- **Store per-day working flags / materialise a date table.** Simple lookups but
  unbounded storage and no closed-form span math; the mask + sparse exceptions is
  compact and O(1)/O(log H).
- **Default new plans to all-days-work (no seed).** Rejected: a construction tool
  defaulting to a 7-day week is a footgun; a seeded Mon–Fri Standard is the least
  surprising default, and null-means-all-days still exists for back-compat.

## Consequences

- The engine gains real working-day dates with **zero change to its pass code** —
  the port seam paid off; the golden suite stays valid for the null-calendar path.
- All the day-math risk is concentrated in one pure, exhaustively-tested factory
  (inverse invariant + differential vs a naive loop), the mitigation the top
  correctness risk demands.
- Planners get a reusable org calendar library and a per-plan default; existing
  plans are untouched until they opt in.
- **Deferred / debt (documented):** **per-activity calendars** (needs the
  calendar-day-axis ADR above), **calendar-day lag units**, **bulk/holiday-provider
  import**, **snap-data-date-to-working-day**, and **timeline non-working shading**
  (M7). A no-working-day pattern is rejected at the factory boundary and by a
  `working_weekdays > 0` DB CHECK (it would make `addWorkingDays` non-terminating).

## References

- ADR-0023 §5 — the `WorkingDayCalendar` port and the calendar seam this fills.
- ADR-0022 — the recalculate path that will inject the calendar (Task C2).
- [`docs/specs/calendars.md`](../specs/calendars.md) /
  [`docs/plans/calendars.md`](../plans/calendars.md) — the M5 spec & plan.
- PROJECT_BRIEF §5 (roles), §17 (CPM correctness as a top risk).
