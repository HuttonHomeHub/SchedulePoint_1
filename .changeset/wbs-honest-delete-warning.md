---
'@repo/web': patch
---

Say what deleting a WBS summary actually does.

Every activity got the same confirmation — `Delete “X”? You can restore it later.` — including a
`WBS_SUMMARY`, whose deletion cascades to its entire subtree (ADR-0038). A planner removing a
grouping was told the reassuring half of the truth: the restore is real, but everything filed under
it goes too, and until then an unknown amount of work has vanished from the plan.

A summary's confirmation now states the descendant count, says plainly that deleting a summary
deletes everything it contains, and points at dissolve as the way to drop the grouping and keep the
work. The count is derived from the already-loaded plan activities, so it degrades honestly: an
empty summary says so, and a list that has not arrived warns about the cascade without inventing a
number rather than claiming the summary is empty.

One helper, asserted at both call sites — the plan workspace and the activities table raise the same
dialog from different code, and a warning on only one of them is the same defect again.
