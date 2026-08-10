---
'@repo/api': minor
'@repo/web': minor
---

Add the Retention section to the staff console (ADR-0087 M3).

`GET /api/v1/staff/health` gains a `retention` object — no new route, so no route-census entry and
no second `staff.panel_read` row per page load — and `/staff` renders it below Mail health.

The leading answer is **derived from the data, not reported by the sweep**: the age of each table's
oldest surviving row against its configured period, which is true whether or not any sweep has ever
run. The sweep's own bookkeeping resets on restart, so a last-run timestamp alone cannot separate
"working" from "never armed". The section keeps three pairs of states distinct that a careless
sentence collapses: an empty table ("no rows") from one whose oldest row is new; a process that has
not swept from one that swept and deleted nothing; and a disabled sweep — which shows no last-run
time at all, because a timestamp beside "disabled" reads as health.
