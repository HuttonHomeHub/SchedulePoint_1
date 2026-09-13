---
'@repo/api': minor
---

A duration is measured on the calendar the work happens on.

For a resource-dependent activity whose driving resource works to a different calendar, the day-
denominated fields — duration, remaining duration, levelling delay, and relationship lag — were
measured on the activity's own calendar while its float was already measured on the driver's. One
activity could therefore report a five-day duration and two days of float on the same row, on two
different day lengths.

They now all use the calendar the activity schedules on (driving resource → activity → plan), which
is the rule the engine has used since resource-dependent scheduling shipped.

**One number changes for readers, with no stored value and no date moved.** A resource-dependent
activity driven by a resource on a different calendar will report a different `durationDays`,
`remainingDurationDays` and `levelingDelayDays` — for example 2,400 stored minutes on a 24-hour
driving calendar now reads `2 d` where it read `5 d`. The stored minutes are unchanged, the dates
are unchanged, and the new number is the one that describes what the programme actually reserves.
Only an activity of type `RESOURCE_DEPENDENT` with a driving resource whose calendar's hours-per-day
differs from its own is affected.

The activity read gains `drivingResourceCalendarId`, so a client can tell which day length a
duration is expressed in without one request per row. It is `null` for every other activity, and
for one whose driver is missing or inherits. External guests adopt the corrected figures; the
resource itself stays invisible to them.
