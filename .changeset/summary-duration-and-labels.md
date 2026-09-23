---
'@repo/web': patch
---

A WBS summary no longer claims a duration of 0. The canvas stops printing "0d · 0d float left" under a summary bar, and the activities table and the Gantt's Duration column show "—" for a summary, as they do for a milestone. A summary's stored duration is not its rolled-up span, so a figure there was false.

A bar whose code is the same as its name, which P6 often uses for the project's root WBS node, shows the name once instead of twice.

The staff console no longer describes every live diagnostic as "work that is wrong now". Most of those counts are ordinary use, such as plans that carry a hand-placed activity.
