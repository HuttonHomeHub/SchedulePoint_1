---
'@repo/api': minor
'@repo/types': minor
---

Say when two revisions' placements cannot be compared, instead of implying they agree.

A baseline captured before placements were frozen holds no `placed_start`, `placed_finish` or
`visual_start`, and no backfill is possible — writing one would state as history a placement that
baseline never saw. The revision comparison now reports that on both routes as
`placementNotAssessableReason`, null when both sides recorded a placement.

It is a nullable REASON and deliberately not a three-valued verdict. A verdict is a thing you can
default, and `?? 'MATCH'` is a defensible-looking line to write beside one; absence of a reason is
the only thing that can mean "comparable", and absence cannot be defaulted into existence. The
mistake is closed by making the shape wrong for it rather than by remembering not to make it.

The flag is a second one beside the existing shape-snapshot flag rather than a widening of it. The
two levels are written by different milestones, so a baseline can carry either without the other,
and folding them is wrong in both directions and silently: a shape-complete baseline would report
its placement as recorded when it is not, and a placement-complete one would report its logic as
unrecorded.

The reason fires whether or not either plan holds a placement. That is the rule all three snapshot
levels are written under — a reason that appeared only when there was something to compare could
not separate "nobody looked" from "we looked and there was nothing". Every comparison against an
existing baseline therefore now carries it, which is correct rather than noisy.

Nothing renders it yet. The CPM engine is not imported and no migration runs.
