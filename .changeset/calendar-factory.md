---
'@repo/api': minor
---

Add the pure `buildWorkingDayCalendar` factory to the CPM engine (M5, ADR-0024):
a real working-day calendar from a weekday bitmask + dated exceptions (holidays
and worked-weekends), implemented behind the existing `WorkingDayCalendar` port
with O(1) week arithmetic + O(log H) binary search over sorted exceptions — no
day-by-day scan, so recalculation stays within the M6 performance budget. Correct
by construction: pinned to a naive day-by-day reference by a differential test and
to the inverse invariant `workingDaysBetween(from, addWorkingDays(from, n)) === n`.
Still an internal library — nothing consumes it yet; the calendar CRUD module and
engine wiring land next.
