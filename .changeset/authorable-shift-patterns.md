---
'@repo/api': minor
---

Author intraday shift patterns through the public API (TECH_DEBT #80)

ADR-0036 shipped split shifts, night shifts crossing midnight and asymmetric weeks in the engine
and in storage. Nothing in the product could create one: the repository derived every calendar's
shifts from a 7-bit weekday mask, so every calendar in every database was a whole-day calendar and
the minute-granular machinery underneath was exercised only by unit tests and the conformance
adapter. A planner on a two-shift site could not describe their working week at all, and the
schedule they got was silently a whole-day approximation of it.

The calendar create/update DTOs take a `shifts` array of `{weekday, startMinute, endMinute}` —
the storage form — mutually exclusive with `workingWeekdays`, which is shorthand for full-day
windows on the named days. Either replaces the whole week as a set. `shifts` is also on the read
DTO: `workingWeekdays` is derived from it and can only say whether a day works at all, so without
that a saved split shift would be invisible the moment it was stored.

Windows are validated at the boundary — sorted, non-overlapping within each day, `start < end`.
The engine asserts the same thing, but at _recalculation_ time, which surfaces an overlap authored
on Monday as a failed schedule run on Wednesday pointing at the plan rather than the calendar.
An unsorted array is rejected rather than quietly sorted: storage is order-sensitive, and
reordering an author's input hides which pair they got wrong.
