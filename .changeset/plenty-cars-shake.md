---
'@repo/api': minor
---

A baseline freezes the placement, not just the network's answer.

A capture recorded where the network said work could go and never where a planner had actually put
it. `baseline_activities` now freezes the engine's effective-Visual span (`placed_start` /
`placed_finish`) and the planner's own hand-placement (`visual_start`) beside the early and late
columns, and `baselines.placement_snapshot_level` records that it looked.

The third column is not redundant with the other two. After the mode collapse the placed span is
what every view draws, so a variance read needs it frozen — but "did a planner put this here, or did
the engine?" is answerable only from `visual_start`, and an activity nobody moved has a placed span
identical to its early one.

The level is written unconditionally, for the third time in this table and for the same reason as
`cost_snapshot_level` and `revision_snapshot_level`: zero placements on a FULL baseline means there
genuinely were none, and the same nulls on a NONE baseline mean nobody looked. A row count cannot
separate those. It is the likelier slip here than for its two siblings, because an unplaced plan's
placement columns are all null and look like nothing worth recording.

It depends on the effective-Visual pass having been taught the pure pass's branches first. Before
that, a progressed activity's placed span ran at full duration from the data date and an LOE or WBS
summary collapsed to a point — and a capture taken then would have frozen all of it immutably. The
new e2e uses exactly that fixture for that reason; a plain five-task plan passes against the defect.

Its sibling case is the one that earns its keep: on an unplaced plan the placed and early spans are
equal by definition, so freezing the early span twice satisfies every assertion. A second fixture
with one hand-placed bar makes that a failing state instead of an indistinguishable one.

Nothing reads the new columns yet. No DTO exposes them, the CPM engine is not imported, and the
recalculation parity gate is untouched.
