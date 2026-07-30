---
'@repo/web': minor
---

Show the WBS: a pinned band on the TSLD canvas, and an honest home for unfiled work.

Two surfaces behind `VITE_WBS_IMPROVEMENTS`, both answering the same complaint — a plan can have a
WBS and still show none of it.

The **Gantt** gathers everything not yet filed under one derived **Unassigned** row. A
half-structured plan used to read as though it were fully structured: the activities nobody had
grouped yet sat at the root beside the summaries, indistinguishable from top-level phases. The
bucket is derived in the view layer and never persisted — a default summary per plan would change
`computeSchedule`'s input for every plan in the system, for a display feature — and it appears only
when there is both something unfiled and a real summary to contrast it with, because heading a flat
list "Unassigned" invents a hierarchy that is not there.

The **TSLD** gains a pinned band across the top, under `View▾ ▸ Structure ▸ WBS band` (default
off), showing the programme at phase level with each bar column-aligned to the diagram beneath it.
It is select-only: a summary's dates are an engine rollup, so there is nothing on it to drag.
Summaries move out of the scene while the band is on — they stay fully reachable by keyboard and
screen reader, which is the property the whole design turns on.

Both read the same definition of what is filed where, so the two views cannot come to disagree
about the word "unassigned". The printed programme gets the same grouping as the screen it was
printed from. The CPM engine is untouched.
