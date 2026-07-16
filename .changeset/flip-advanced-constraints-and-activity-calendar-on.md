---
'@repo/web': minor
---

Enable the **advanced schedule constraints** (`VITE_ADVANCED_CONSTRAINTS`, ADR-0035 §7–§11, M4) and
**per-activity calendar picker** (`VITE_ACTIVITY_CALENDAR`, ADR-0037, M5) by default. The activity
form's Advanced-scheduling group (secondary constraint, as-late-as-possible, expected-finish), the
plan-level Expected-finish toggle, the activities-table Conflict badge, and the per-activity Calendar
select now ship on. Both surfaces' quality gates are cleared (the advanced-constraints editor's
accessibility/component/UX reviews are green; the activity-calendar picker reuses the reviewed
plan-calendar picker's primitive and states). No API or engine change — those were already live
regardless of the flags. Set `VITE_ADVANCED_CONSTRAINTS=false` or `VITE_ACTIVITY_CALENDAR=false` to
roll either back.
