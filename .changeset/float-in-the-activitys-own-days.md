---
'@repo/api': minor
---

Float is persisted in the activity's own calendar days

`total_float`, `free_float` and `visual_drift_days` are stored **in days**, converted from engine
minutes by the recalculation's own batched write. They divided by a flat 1440 while durations had
just moved to the calendar's working day — so one span would have read as "3 days of work with 1 day
of float", which is not a smaller change than converting them but an incoherent one.

They now take the factor of the calendar each activity actually schedules on, which is where
ADR-0035 already says its total float is measured — so the unit and the measurement finally agree.
The factor is resolved once per distinct calendar in the plan, so a 2,000-activity plan on three
calendars costs three rows.

The **cross-plan derivation deliberately keeps a fixed 1440**, and now says so in a comment. It is
the one place a day-denominated value becomes engine input, and its arithmetic walks _calendar_ days
over a date-only value — feeding it a working-hours-scaled number would compound two approximations
exactly where the result moves dates. ADR-0068 §3b originally said the opposite; building it showed
that to be wrong and the ADR is corrected rather than quietly followed.

Every existing calendar carries the 24-hour default, so no existing plan's float changes.
