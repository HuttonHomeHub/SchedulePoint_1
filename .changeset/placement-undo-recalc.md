---
'@repo/web': patch
---

Undoing a bar move now re-plots the bar.

A drag writes a hand-placement, and the fingerprint that decides when the schedule is
re-derived did not watch that field — so `Ctrl+Z` removed the placement underneath the bar
and left the bar drawn where it had been dragged. Clearing the same placement from the
selection bar always re-plotted it correctly; the two routes now agree.
