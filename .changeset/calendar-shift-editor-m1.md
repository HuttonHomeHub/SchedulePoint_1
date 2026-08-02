---
'@repo/web': minor
---

Author a calendar's working hours, not just its working days (behind `VITE_CALENDAR_SHIFT_EDITOR`)

ADR-0036 gave calendars intraday shift patterns a year ago — split shifts, night shifts crossing
midnight, asymmetric weeks with a half-day Friday. The engine has scheduled all of it since. The
calendar form offered seven weekday checkboxes, which can say only _whether_ a day works.

Behind `VITE_CALENDAR_SHIFT_EDITOR` (default off) the week becomes seven lists of `HH:MM` periods.
A day with no periods doesn't work; a day with two is a split shift. A night shift is two periods on
two days — 20:00–24:00, then 00:00–06:00 — which the editor states and writes literally rather than
inferring on read, because that inference is indistinguishable from a genuine 24-hour calendar.

Times are text, not `<input type="time">`: storage ends a full day at **24:00** and the native
control stops at 23:59. Reading `00:00` back as 24:00 was rejected — 00:00 is a legitimate start.

The rows are built on a new shared `WindowListEditor`, which the dated-exception editor will use
too. One primitive because a window is authored in two places, and two editors would have to
independently agree about ordering, overlap and midnight — a disagreement only a planner who
authored the same hours both ways would ever see.

Ordering and overlap are checked before the request goes out, so the message names the row you
typed in rather than a pair of minutes; the API stays the enforcing boundary. Every day's problems
are reported at once rather than one save at a time.

Flag off, the seven checkboxes are unchanged and the existing suites pin them — they are the
rollback contract, kept rather than weakened. A new calendar's default week is still full days, so
the meaning of a "1 day" duration is exactly what it is today.
