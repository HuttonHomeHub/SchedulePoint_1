---
'@repo/web': minor
---

The plan's facts move into the activities row.

The workspace foot carried two bands where one would do, and both said "Activities" — the row's own
heading and the status bar's activity count, the same subject rendered twice. The count now names
the panel and gives its size, so one control does both jobs and the word appears once. The canvas
gains about 25 px at every width where that row exists.

Where the facts render is decided by a registry rather than a branch: the collapsed activities bar
mounts an outlet, so the facts land in the row a planner is already reading; expanded, or below the
`md` breakpoint where that bar is not mounted at all, they render in the shell's status row exactly
as before. That fallback is not a courtesy — without it the merge would delete the plan's facts on
the narrowest screens, which have the least room to lose them.

Arming a tool or selecting an activity still costs the canvas no height, asserted as an equality in
a real browser rather than as a claim.
