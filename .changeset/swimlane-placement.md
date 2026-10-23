---
'@repo/api': minor
'@repo/types': minor
---

A plan can now say where its swimlanes come from, and an activity can be placed in one. The plan update takes `swimlaneSource` (none, hand-made or WBS) and a WBS level of 1 to 3. Activity create and update take `swimlaneId`, and the batch lane-position write takes an in-swimlane lane per activity; the server works out which swimlane or WBS group the lane belongs to. Every activity response now carries its `swimlaneId` and its stored `swimlaneLanes`. Moving an activity into another swimlane appears in its change history. Nothing in the web app uses them yet.
