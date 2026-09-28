---
'@repo/api': minor
---

The staff console's Diagnostics panel reports two more counts: how many tasks have zero duration,
and how many of those hold a live resource assignment. A zero-duration task is dated at the start
of its day, where a finish milestone at the same point is dated at the end of it; these counts size
how many activities a coming change to that behaviour will reach. Both are prospective: they count
tasks as they are now, not stored numbers that went wrong, and a zero-duration task is not
necessarily a mistake.
