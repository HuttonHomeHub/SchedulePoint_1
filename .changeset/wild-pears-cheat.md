---
'@repo/web': minor
---

Working-week presets and copy-day in the calendar shift editor (ADR-0067 M2, behind
`VITE_CALENDAR_SHIFT_EDITOR`).

Five presets — Standard week, Two shift, Continental days, 24/7 and Window-only — each labelled
with its hours, because a preset whose hours are invisible is a guess. A preset is a verb: it
writes windows and then has no further existence, so nothing persists which one produced them.

Each day gains a "Copy … to…" menu with three targets (the other weekdays, every other day, the
weekend). Copy replaces the target days rather than merging into them, and announces which days it
overwrote — the half a planner cannot see afterwards.

A NEW calendar now starts from the Standard week (Mon–Fri 08:00–17:00) with a matching 9-hour
standard working day, instead of a full-day Mon–Fri whose activities scheduled nearly three times
too fast. A round-the-clock calendar is one click away — the 24/7 preset.
