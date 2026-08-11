---
'@repo/web': minor
---

One activity field vocabulary: the New-activity dialog and the tabbed editor now render
the same fields from the same components (ADR-0089).

The two surfaces that edit an activity shared no code and had drifted in ten places.
Six of those were defects a planner could hit, and all are fixed:

- An activity nested under a summary the picker cannot resolve no longer renders as
  **top level**. It kept its real parent on save, so the screen and the record
  disagreed — and correcting what looked like a mistake corrected nothing.
- A `MANDATORY_*` constraint no longer renders as **no constraint at all** with its date
  filled in below it. It keeps its place under a label saying what it actually does.
- The option that keeps the Type selector honest is no longer a **one-way door**:
  selecting a different type no longer removes the activity's own stored type from the
  list.
- The editor now explains why a level-of-effort, WBS-summary or resource-dependent
  activity has no duration field, where it previously removed the control silently.
- A resource-dependent activity's calendar is now read-only rather than disabled, so the
  binding stays readable, selectable and copyable.
- **A payment milestone can carry its cost.** Cost and earned-value fields were withheld
  from every type with no duration, and the New-activity dialog is the only surface that
  makes a milestone — so the value could not be entered anywhere.

Also: the WBS parent picker is labelled "Parent WBS summary" on both surfaces (it
collided with a Type option named "WBS summary"), summaries are offered by code and
name, "Schedule as late as possible" and "Expected finish" move out of Constraints into
their own "Placement & targets" section, and money fields take hundredths from zero up
on a decimal keypad.
