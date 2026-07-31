---
'@repo/api': patch
---

Fix WBS summary rollup: the activity's WBS parent never reached the CPM engine

`loadActivities` did not select `parentId` and `toEngineActivity` did not pass it, so every
`WBS_SUMMARY` arrived at `computeSchedule` with no visible children and took the ADR-0035 §24
empty-summary branch — collapsing to a zero-length point on the project data date. On an imported
P6 programme that meant every phase bar drew as a 2px sliver on the project start instead of
spanning its work.

Nothing errored, because the empty-summary collapse is a defined answer, and the engine's own
rollup suite passes `parentId` in directly so it stayed green. The regression test therefore sits
at the service seam, nested two levels deep so it also covers the deepest-first ordering.
