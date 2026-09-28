---
'@repo/web': patch
---

The Schedule CSV export now leads with `Start`/`Finish` columns carrying the dates each bar is
drawn from on the canvas and the Gantt — the placed dates, not the network's earliest ones. The
existing `Early start`/`Early finish` columns are unchanged and still read the network basis, for
the analyses (DCMA, float paths, baseline variance) that measure the plan as computed rather than
as placed.
