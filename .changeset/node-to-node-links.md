---
'@repo/web': minor
---

Logic links now leave and enter the node glyphs at each end of a bar, the way NetPoint draws them.
Each link tries up to eleven shapes and takes the one that passes through the fewest other bars,
then crosses the fewest other links, then is shortest. A second pass moves a link to another shape
only when that is strictly better for the picture as a whole. Links from one node share a stem.
A link to a milestone in another lane arrives at the triangle's centre from above or below. A lag
plate is placed where it covers no name or date, and is left off when there is no such place; the
lag is still in the link's spoken summary. The old corridor router is retired.
