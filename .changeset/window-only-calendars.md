---
'@repo/api': minor
'@repo/types': minor
---

Accept a window-only calendar (TECH_DEBT #79)

ADR-0036 §2 made a window-only base week valid — every weekday non-working, all working time
arriving from dated exception windows, the shape a plant turnaround or a shutdown programme needs —
and said the old "mask must be non-zero" guard was replaced by the engine's
`buildWorkingTimeCalendar` check. That check is strictly stronger: it counts the exception windows
as well as the base week, so it can tell a turnaround calendar apart from a calendar on which
nothing can ever be scheduled, which a weekday mask alone cannot.

The DTO's `@Min(1)` was never relaxed to match, so for a year the engine supported the shape and the
API answered 422 with no workaround. This is that unfinished migration, not a new capability.

`MIN_WORKING_WEEKDAYS_MASK` moves 1 → 0 and both calendar DTOs pick it up through the shared
constant. The calendar **form** keeps its own "at least one working day" rule, stated locally rather
than borrowed from the shared helper: it cannot author the exception windows a window-only calendar
needs, so offering the empty week there would build a calendar that fails at the next
recalculation. That bound lifts with the shift-pattern editor (#80, web slice).
