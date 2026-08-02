---
'@repo/api': minor
---

Relationship lag is measured on its lag calendar's working day

`lagDays` converted at a flat 1440 minutes, so a "1 day lag" on an 08:00–17:00 calendar was three
working days of delay — the same defect durations had, on the other half of the network.

It now converts on the calendar the relationship's `lagCalendar` names (ADR-0068 §4): the
predecessor's, the successor's, the plan's, or — for `TWENTY_FOUR_HOUR` — a **hard-pinned 1440**,
because escaping working-time arithmetic is the entire meaning of that option.

The factor therefore varies **per dependency row**, not per plan, so one page of a plan's logic can
need several. The endpoint calendars ride on the join the read already does, and a page costs one
extra lookup. A PATCH that switches `lagCalendar` and edits `lagDays` in the same call converts
against the option it is switching **to**.

Every existing calendar carries the 24-hour default, so no existing plan changes.
