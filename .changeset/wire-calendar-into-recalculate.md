---
'@repo/api': minor
---

Wire the working-day calendar into CPM recalculation (M5 Task C2, ADR-0024) — the
engine now computes **true working-day dates**. `ScheduleService.recalculate` loads
the plan's calendar (`working_weekdays` + active exceptions) as part of the locked
recalc snapshot, builds a `WorkingDayCalendar` once via `buildWorkingDayCalendar`, and
injects it at the existing `ComputeOptions.calendar` port seam — **the pure engine's
pass code is unchanged**. A plan with no calendar (or a defensively-missing one) uses
`allDaysWorkCalendar`, so the null path is byte-identical to M6 and the golden suite
still holds. Early/late start & finish now skip the calendar's non-working weekdays and
holiday dates, and the project finish absorbs them. The calendar used is recorded in the
recalc audit log. The calendar maths is O(1) week arithmetic + O(log H) per call (built
once per recalc), so recalculation stays within the M6 performance budget; a perf smoke
at 500 activities now also runs on a real Mon–Fri calendar.
