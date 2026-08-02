---
'@repo/seed': minor
'@repo/api': patch
---

Seed calendars with their real shift windows, and add the `capability-shift-calendars` plan.

The seeder sent a weekday mask and an `isWorking` flag, so a `SeedSpec` two-shift calendar was
created as a 24-hour one: the intraday half of ADR-0036 was demonstrated by nothing, and the
coverage report excepted six capability keys for a cause (`no write path accepts shift windows`)
that stopped being true in api-v0.34.0. It now sends `shifts` and exception `windows` verbatim,
plus the calendar's `hoursPerDay` (ADR-0068).

`capability-shift-calendars` is the plan that could not previously exist: nine calendars whose
working **days** are identical and whose **hours** are not — eight-hour, two-shift, twelve-hour,
round-the-clock, split-day, short-Friday, nights across midnight, window-only, and one whose stated
standard day deliberately disagrees with its week. Two of them agreeing means the hours are not
being read. Its `docs/TEST_PLAYBOOK.md` row says so, and the six excepted keys are now reached.
