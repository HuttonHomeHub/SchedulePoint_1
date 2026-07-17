---
'@repo/api': minor
'@repo/types': minor
---

Expose the **multiple-float-paths** analysis over REST (ADR-0035 §19), closing the one deferred piece of
M6-F6. `GET /organizations/:orgSlug/plans/:planId/schedule/float-paths?target=&maxPaths=` returns the
ranked contiguous driving chains into a target activity — path 0 the driving chain (relative float 0),
branch paths in non-decreasing relative-float order, bounded by `maxPaths` (default 10, max 50). It is a
read-only analysis (`schedule:read`, every member): it recomputes the schedule live through the same
engine-input builder `recalculate` uses, so it can never drift from a recalculation, and never persists.
Relative float is returned in working days. 422 if the plan has no start date; 404 if the target activity
is not active in the plan; 400 if `target` is missing or not a UUID. Adds the shared `PlanFloatPath` /
`PlanFloatPaths` types. Also a conformance-matrix reconcile: the Start-On/Finish-On both-pass pin, the
N11 zero-working-hour hang guard, the N16 lag-horizon cap, and the minute-granular baseline (S01) are
confirmed in-engine and marked supported (their notes had gone stale after the M1 minute rework).
