---
'@repo/web': patch
---

Links on the diagram no longer run on top of each other in opposite directions. Where a link into a
node shared its track with the link out of it, two arrowheads pointed at each other on one line at
whole-plan zoom and again when zoomed right in. The router now moves one of the pair off that track,
going round the node or through the gutter above or below if it has to. It never hides more of a
link behind a bar to do it. Crossings on large plans also fall by about a tenth. Tidy takes longer
to run: about a third longer than the previous release on a 144-activity plan.
