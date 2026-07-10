---
'@repo/web': minor
---

Surface the computed CPM schedule in the plan view (read-only). The activities
table gains early/late start & finish and total-float columns plus a
critical / near-critical badge (late dates hide first on narrow screens; an
uncomputed plan shows em dashes). A new schedule summary strip shows the data
date, project finish, and the activity / critical / near-critical counts, with a
"not yet calculated" empty state and its own loading/error states. Adds a shared
`Badge` primitive and `scheduleKeys` / `useScheduleSummary`. The Recalculate
action is a separate control (next).
