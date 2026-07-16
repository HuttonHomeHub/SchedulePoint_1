---
'@repo/api': minor
'@repo/types': minor
'@repo/web': minor
---

Per-activity working-time calendars (M5, ADR-0037). Each activity can now carry its own
`calendarId` (create/update/response API + shared `ActivitySummary`) — `null` inherits the plan
default. The CPM engine moved to an **absolute working-instant** axis so each activity's duration,
float, and dates are measured on **its own** calendar: a 24/7 commissioning activity inside a 5-day
plan works across weekends, and a relationship's `PREDECESSOR`/`SUCCESSOR` lag now resolves to the
endpoint activity's calendar (completing M3's forward-wiring). A plan where every activity inherits
the plan calendar recalculates **byte-identically** (the golden suite is the parity gate). The
activity calendar is validated in-org under the calendar advisory lock (like the plan picker), and
the recalculation resolves each distinct calendar once (O(distinct calendars), not O(activities)).
