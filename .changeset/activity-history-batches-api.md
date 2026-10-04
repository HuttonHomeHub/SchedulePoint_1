---
'@repo/api': minor
'@repo/types': minor
---

Record the changes that touch several activities at once, and the ones somebody else's action causes. A
group move, levelling's apply, a batch re-parent and a dissolve now write one history entry per activity,
saved together and never merged; a cross-plan link is recorded on both of its activities, each in its own
plan; and when an activity is deleted or restored, every surviving activity that was linked to it gets an
entry saying its link went or came back (the deleted activity itself stays in the audit log). The history
route returns these entries with their `batch` and a new `origin`, and `xlink:` items for cross-plan links.
A batch holds its plan's history lock exclusively and issues the same three recorder statements for one
row or two thousand.
