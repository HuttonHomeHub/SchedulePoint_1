---
'@repo/api': minor
---

Teach the effective-Visual pass the branches the pure pass has: actuals, derived spans, and the WBS
rollup.

The epic that introduced Visual mode claimed "Early is Visual's resting state" and cited a fixture of
five plain unprogressed tasks — true of that fixture, false of any plan anybody has reported progress
on. Pass 1 freezes on a reported actual, schedules the **remaining** work, derives a Level of
Effort's span from its hammock and rolls a WBS summary's up from its children; Pass 2 had none of
those, so a progressed or grouped activity rendered in two different places depending on which basis
a view read.

Four things are corrected, all in the placed basis only. A reported actual freezes the placed bar
exactly as it freezes the early one, so a placement is inert against it. The placed bar's length is
now read the way the early bar's is — from the computed instants, not the input duration — so an LOE
and a WBS summary stop collapsing to a point wherever they are drawn and a progressed activity stops
being drawn at full length. And an unplaced summary now renders at its rolled-up start rather than at
the data date.

Nothing about the pure forward/backward pass changes: early and late dates, float, criticality and
the project finish are byte-identical, and all 264 pre-existing engine tests pass unedited, which is
the before/after oracle. Pass 2's propagation is unchanged too — the summary correction is a display
read, and a summary is never a predecessor.

Every clause is pinned by a mutation verified to fail against the defect it guards, including the
careless port that would collapse a zero-duration task by re-deriving a rule instead of sharing it.
