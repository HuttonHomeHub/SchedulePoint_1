---
'@repo/api': minor
'@repo/types': minor
---

A calendar carries an hours-per-day (ADR-0068, schema + write seam)

`durationDays` has always been converted to stored minutes by multiplying by 1440. That was correct
for every calendar in the system, because until `api-v0.34.0` nothing could author a weekly pattern
that was not full days. Now that an 08:00–17:00 week is authorable, an activity entered as "1 day"
on one is 1440 working minutes — **2.67 working days**, because the calendar only supplies 540 a day.

`calendars.hours_per_day_minutes` is Primavera P6's `day_hr_cnt`, and it becomes the day↔minute
factor for every day-denominated field measured on that calendar. `POST`/`PATCH` accept an explicit
`hoursPerDay` in hours (fractional allowed — 7.5 is 450 minutes exactly); the read exposes
`hoursPerDay` beside `hoursPerDayMinutes`, the pair an activity already exposes for its duration.

Omit it and the service derives a default **from the pattern being written, once, and stores it** —
the modal working day among the days that work. It is deliberately not derived on read: that would
make the factor a function of the shift rows, so shortening one Friday would silently reinterpret
the stored duration of every activity on the calendar, with no pen held and no recalculation asked
for. It also has no answer for a window-only calendar, where every candidate rule derives zero and
`durationDays × 0` zeroes the activity.

`baselines.hours_per_day_minutes` captures the factor at freeze, applying ADR-0025's snapshot-copy
rule — otherwise a later calendar edit would rewrite what a two-year-old baseline reports.

**Nothing changes yet.** The default is 1440, the constant the services already multiply by, so every
existing calendar, plan, activity and baseline reads exactly as before; and the CPM engine cannot see
the column at all — its calendar port is built from shift and exception rows — so the recalculation
parity gate is structurally untouched. Wiring the factor through the duration, lag, float and
interchange seams is the next slice.
