---
'@repo/web': minor
---

Add the Recalculate action to the plan view (Planner/Org Admin). A `Recalculate`
button triggers the CPM engine and refetches the schedule summary and activities
so the computed dates, float and critical-path badges update in place; a plan
with no start date surfaces a friendly inline prompt (from the API's 422) instead
of a raw error, and other failures are announced politely. Readers don't see the
action. Also darkens the `--primary` design token slightly so white-on-primary
buttons clear the WCAG 2.2 AA 4.5:1 contrast bar (verified by axe) — an app-wide
accessibility fix the new page surfaced.
