---
'@repo/seed-http': minor
---

The seeder sends minutes, and stops refusing what the API now accepts

Two pieces of drift, both of the shape ADR-0058 is about — a comment described a limitation, the
limitation was fixed, and the comment kept being believed.

**Durations and lags are seeded in minutes.** The seeder rounded each to whole days and reported the
loss as an approximation, citing TECH_DEBT #78 — which closed when `durationMinutes` and `lagMinutes`
reached the public DTOs. Sending minutes removes the rounding entirely, so a seeded plan is a
faithful copy rather than a near one; it also sidesteps ADR-0068, since a "day" now means the
calendar's working day and a day-denominated seed would mean different things on different
calendars.

**A window-only calendar is created rather than refused.** The seeder skipped it and reported
`WINDOW_ONLY_CALENDAR_UNSUPPORTED`, quoting a `@Min(1)` on the weekday mask that no longer exists
(TECH_DEBT #79 closed; the minimum is 0). It now seeds like any other calendar.

The capability-coverage exceptions are corrected with it. Four `cal_*` shift keys were excused as
"no write path accepts shift windows" — the API accepts them now, and what remains is that a
`SeedSpec` calendar carries working _days_, so the seeder has nothing to send. The two window-only
keys keep an exception but with the true reason: expressible now, but no catalogue plan has one, so
nothing demonstrates it end to end. That is a seed plan to write, not an API change.
