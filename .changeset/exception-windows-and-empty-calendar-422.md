---
'@repo/api': minor
'@repo/types': minor
---

Author a dated exception's hours, and stop answering 500 for an empty calendar (TECH_DEBT #79/#80)

`api-v0.34.0` made the weekly pattern authorable as intraday shift windows. The dated-exception half
was the same defect one table over: `createException` derived a day's windows from the `isWorking`
boolean, so a worked exception was always a **whole** worked day. A half-day before a holiday, a
short-crew shutdown day, and the hours a window-only calendar exists to carry were all unauthorable,
while `calendar_exception_windows` sat in the schema and the engine read it every recalculation.

`windows` now joins `isWorking` on the exception DTO — mutually exclusive, since `isWorking` is
shorthand for the whole-day case and sending both would be two answers to one question. An empty
`windows` array is refused so "no working time" has exactly one spelling. Both forms resolve through
one `exceptionWindowRowsFor` shared with the interchange batch, which previously carried its own
inline copy of the rule. `windows` is on the read DTO too: without it an authored half-day would be
invisible the moment it was saved.

`endDate` is exposed on the exception read. Storage has always held a range and the DTO returned
only `startDate` — an end date the client could not see is one it could not be told changed. Only a
single day is authorable, so it equals `date` for every exception this API creates; the point is
that the contract stops hiding a column.

**A live 500 is fixed with it.** Accepting `workingWeekdays: 0` in `api-v0.34.0` (TECH_DEBT #79)
lifted the DTO bound without mapping the engine guard it had been standing in for. A brand-new
window-only calendar has no working time until it carries an exception, and recalculating a plan on
one threw out of `buildWorkingTimeCalendar` into an opaque `INTERNAL_ERROR` — a user-caused,
user-fixable state reported as a server fault, naming neither the calendar nor the fix, reachable in
two clicks with no flag. It is now a 422 `CALENDAR_HAS_NO_WORKING_TIME` carrying the calendar's name
and what to add, raised as a named `EmptyWorkingTimeCalendarError` (the engine is the only layer that
sees both the weekly pattern and the exceptions; the service is the only one that can phrase the
rejection). The window-only shape stays valid — the second regression test recalculates the same
calendar successfully once one working exception gives it hours.

`@repo/types` gains `CalendarWindow`/`CalendarShift`, `shifts` on `CalendarSummary`, and
`windows`/`endDate` on `CalendarExceptionSummary`, plus `WorkingWeekdays.toFullDayShifts` — the one
statement of what a weekday mask means in the storage form the engine schedules on, now shared by
the API's write path and the client instead of restated on each side.

The CPM engine's scheduling is unchanged: it has read shift and window rows since ADR-0036, so the
recalculation parity gate is untouched. Every field is additive and existing clients keep today's
behaviour.
