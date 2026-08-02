---
'@repo/api': minor
---

Durations are measured on the calendar's working day, not on a 24-hour one

An activity entered as "1 day" was stored as 1440 working minutes on every calendar. On an
08:00–17:00 week — 540 working minutes a day — the engine correctly scheduled that across **2.67
working days**, so a five-day activity drawn as five columns on the canvas snapped to thirteen after
the next recalculation.

`durationDays` and `remainingDurationDays` now convert on the activity's **effective calendar**
(its own if it names one, otherwise the plan's) using that calendar's `hoursPerDay` — ADR-0068,
Primavera P6's `day_hr_cnt`. The write resolves the factor **inside the transaction**, after the
calendar guard, so a PATCH that changes the calendar and the duration together cannot convert
against the old week.

Reads use the same factor, because they have to: with only the write converted, saving "2 days"
would store the right minutes and read back as "1". The service attaches the factor to each row and
the response mappers use it — a required property, so a service that forgets to decorate is a
compile error rather than a response quietly reporting every duration against 24-hour days. The
guest share view resolves it the same way, so a guest and a member can never see a different number
of days for the same activity.

Every existing calendar carries the 24-hour default, so **nothing changes for any existing plan**;
and the CPM engine still cannot see the column, so the recalculation parity gate is untouched.
Dependency lag, the persisted float columns and baseline durations still use the old constant and
are the next slice.
