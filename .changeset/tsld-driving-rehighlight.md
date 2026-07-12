---
'@repo/web': patch
---

Fix stale driving-arrow styling on the TSLD canvas after a recalculate. The CPM
recalculate rewrites each dependency's engine-owned `isDriving` flag, but
`useRecalculate` only invalidated the schedule summary, activities and baseline
variance — not the dependency query where `isDriving` lives. So after a
reposition-in-time or create-activity edit (which recalc but don't otherwise touch
the dependency cache), the driving-vs-non-driving arrows could render stale until a
manual refresh. `useRecalculate` now also invalidates the plan's dependency query,
closing the last gap in TSLD M3 (live critical path + driving arrows).
