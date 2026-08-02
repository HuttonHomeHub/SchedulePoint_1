---
'@repo/api': minor
---

A baseline freezes the calendar's hours-per-day, so a snapshot stays a snapshot

ADR-0025's central call is that a baseline is a frozen **copy**, not a reference. With the day↔minute
factor living only on `calendars`, editing a calendar's hours-per-day would have retroactively
changed what a two-year-old baseline reported as its captured durations and its variance — a
snapshot that moves is not a snapshot.

`baselines.hours_per_day_minutes` is captured at freeze alongside the data date and the project
finish, and both the snapshot DTO and the variance calculation read **it**, never the live
calendar's. So a baseline taken on a 24-hour calendar keeps reporting 24-hour days even after the
calendar moves to an 8-hour week, which is the only reading under which "we planned 10 days and took
12" means anything a year later.

Every existing baseline carries the 24-hour default, so nothing any of them reports changes.
